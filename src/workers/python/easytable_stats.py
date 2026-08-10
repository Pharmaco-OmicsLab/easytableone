import json
import warnings
warnings.filterwarnings(
    "ignore",
    message="Degrees of freedom <= 0 for slice",
    category=RuntimeWarning,
)
import numpy as np
import pandas as pd
import scipy.stats as stats
import scipy
from scipy.stats.mstats import winsorize
from statsmodels.stats.multicomp import pairwise_tukeyhsd
from statsmodels.stats.multitest import multipletests

POSTHOC_ALPHA = 0.05
SMD_DISPLAY_CAP = 10.0
SMD_CAPPED_SENTINEL = SMD_DISPLAY_CAP + 1e-6
HETEROSCEDASTIC_ANOVA_NOTE = (
    "Levene/Brown-Forsythe variance check was significant, so the ordinary one-way ANOVA result "
    "rests on an equal-variance assumption these data do not support. The indicated alternative is "
    "Welch's ANOVA, which is not available in this release. Switching to Kruskal-Wallis does not "
    "address unequal variances and is not a substitute."
)


# ─────────────────────────────────────────────────────────────────────────────
# SMD helpers
# ─────────────────────────────────────────────────────────────────────────────

def calc_smd_continuous(g1, g2):
    """Cohen's d with pooled SD (Yang & Dalton 2012 for 2-group continuous)."""
    m1, m2 = np.nanmean(g1), np.nanmean(g2)
    v1, v2 = np.nanvar(g1, ddof=1), np.nanvar(g2, ddof=1)
    if any(np.isnan(x) for x in [m1, m2, v1, v2]):
        return np.nan
    s_pooled = np.sqrt((v1 + v2) / 2)
    if s_pooled == 0:
        return 0.0 if m1 == m2 else np.inf
    return abs(m1 - m2) / s_pooled


def calc_smd_categorical(counts1, counts2):
    """
    Binary   → pooled-SD formula.
    Multi-cat → multivariate SMD per Yang & Dalton (2012); uses pinv for robustness.
    """
    total1 = counts1.sum()
    total2 = counts2.sum()
    if total1 == 0 or total2 == 0:
        return np.nan
    p1 = counts1 / total1
    p2 = counts2 / total2

    if len(p1) == 2:
        # (S-12) binary: guaranteed len > 1, use iloc[1] directly
        pr1 = p1.iloc[1]
        pr2 = p2.iloc[1]
        den = np.sqrt((pr1 * (1 - pr1) + pr2 * (1 - pr2)) / 2)
        return abs(pr1 - pr2) / den if den > 0 else (0.0 if pr1 == pr2 else np.inf)

    # k > 2: use k-1 categories (drop last)
    p1_k = p1.values[:-1]
    p2_k = p2.values[:-1]
    S1 = np.diag(p1_k) - np.outer(p1_k, p1_k)
    S2 = np.diag(p2_k) - np.outer(p2_k, p2_k)
    S = (S1 + S2) / 2
    diff = p1_k - p2_k
    try:
        # (S-7) use pinv — never raises on singularity
        inv_S = np.linalg.pinv(S)
        smd2 = diff.T @ inv_S @ diff
        return float(np.sqrt(max(smd2, 0)))
    except Exception:
        return np.nan


def compute_plot_data(df_group, var, group_var, is_categorical):
    """
    Computes tidy data structure for plots.
    """
    group_col = group_var if (group_var and group_var in df_group.columns) else None
    raw_list = []
    
    if group_col:
        df_sub = df_group[[var, group_col]].dropna()
        for _, row in df_sub.iterrows():
            val = row[var]
            if not is_categorical:
                try:
                    val = float(val)
                except Exception:
                    continue
            else:
                val = str(val)
            raw_list.append({
                "val": val,
                "group": str(row[group_col])
            })
    else:
        df_sub = df_group[[var]].dropna()
        for _, row in df_sub.iterrows():
            val = row[var]
            if not is_categorical:
                try:
                    val = float(val)
                except Exception:
                    continue
            else:
                val = str(val)
            raw_list.append({
                "val": val,
                "group": "All"
            })
            
    plot_data = {
        "type": "categorical" if is_categorical else "continuous",
        "raw": raw_list
    }
    
    if not is_categorical:
        qq_data = {"points": [], "lines": []}
        if len(raw_list) > 0:
            from collections import defaultdict
            grouped_vals = defaultdict(list)
            for p in raw_list:
                grouped_vals[p["group"]].append(p["val"])
                
            for g_name, vals in grouped_vals.items():
                if len(vals) > 0:
                    sample_vals = np.sort(vals)
                    n = len(sample_vals)
                    p_pos = (np.arange(1, n + 1) - 0.375) / (n + 0.25)
                    theoretical_quantiles = stats.norm.ppf(p_pos)
                    
                    for t_q, s_v in zip(theoretical_quantiles, sample_vals):
                        qq_data["points"].append({
                            "theoretical": float(t_q),
                            "sample": float(s_v),
                            "group": g_name
                        })
                        
                    if n > 1:
                        try:
                            _, (slope, intercept, _) = stats.probplot(sample_vals, dist="norm")
                            for x_val in [-3.0, 3.0]:
                                qq_data["lines"].append({
                                    "x": float(x_val),
                                    "y": float(slope * x_val + intercept),
                                    "group": g_name
                                })
                        except Exception:
                            pass
        plot_data["qq"] = qq_data
        
    return plot_data


def _finite_p(value):
    try:
        p = float(np.asarray(value).item())
        return p if np.isfinite(p) else None
    except Exception:
        return None


def _normality_check(var_groups_data):
    """Apply D11's normality criterion independently to each group."""
    normal = True
    shapiro_pvals = []
    methods_used = set()

    for g_s in var_groups_data:
        if len(g_s) < 3:
            methods_used.add("shapiro")
            normal = False
            break
        if len(g_s) <= 2000:
            methods_used.add("shapiro")
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore')
                    _, p_sw = stats.shapiro(g_s)
                if not np.isnan(p_sw):
                    shapiro_pvals.append(float(p_sw))
                if np.isnan(p_sw) or p_sw < 0.05:
                    normal = False
            except Exception:
                normal = False
        else:
            methods_used.add("skew_kurtosis")
            try:
                sk = stats.skew(g_s, bias=False)
                ku = stats.kurtosis(g_s, bias=False, fisher=True)
                if abs(sk) >= 1 or abs(ku) >= 1:
                    normal = False
            except Exception:
                normal = False

    if methods_used == {"shapiro"}:
        method = "shapiro"
    elif methods_used == {"skew_kurtosis"}:
        method = "skew_kurtosis"
    elif methods_used:
        method = "mixed"
    else:
        method = None

    return normal, (min(shapiro_pvals) if shapiro_pvals else None), method


def compute_posthoc(test_name, groups, var_groups_data, df_group, var, group_var, is_categorical, omnibus_p, rng, yates=False):
    """Pairwise post-hoc comparisons for significant k>2 omnibus tests."""
    if len(groups) <= 2 or omnibus_p is None or omnibus_p >= POSTHOC_ALPHA:
        return None

    group_labels = [str(g) for g in groups]
    reason = f"{test_name} significant (p={float(omnibus_p):.4g}); {len(groups)} groups"

    if not is_categorical and test_name == "ANOVA":
        try:
            values = []
            labels = []
            for g, series in zip(group_labels, var_groups_data):
                arr = pd.to_numeric(series, errors="coerce").dropna().astype(float).to_numpy()
                values.extend(arr.tolist())
                labels.extend([g] * len(arr))
            if len(set(labels)) <= 2:
                return None
            tukey = pairwise_tukeyhsd(values, labels, alpha=POSTHOC_ALPHA)
            pairs = []
            groups_u = list(tukey.groupsunique)
            idx_a, idx_b = np.triu_indices(len(groups_u), 1)
            for i, (ia, ib) in enumerate(zip(idx_a, idx_b)):
                a, b = groups_u[ia], groups_u[ib]
                p_adj = _finite_p(tukey.pvalues[i])
                pairs.append({
                    "groupA": str(a),
                    "groupB": str(b),
                    "pValueRaw": p_adj,
                    "pValueCorrected": p_adj,
                    "significant": bool(tukey.reject[i]),
                })
            return {"reason": reason, "correction": "tukey", "method": "tukey_hsd", "pairs": pairs}
        except Exception as e:
            return {
                "reason": reason,
                "correction": "tukey",
                "method": "tukey_hsd",
                "pairs": [],
                "error": f"Post-hoc failed: {type(e).__name__}",
            }

    if not is_categorical and test_name == "Kruskal-Wallis":
        try:
            import scikit_posthocs as sp
            data_arrays = [
                pd.to_numeric(series, errors="coerce").dropna().astype(float).to_numpy()
                for series in var_groups_data
            ]
            raw = sp.posthoc_dunn(data_arrays, p_adjust=None)
            adj = sp.posthoc_dunn(data_arrays, p_adjust="holm")
            pairs = []
            for i in range(len(groups)):
                for j in range(i + 1, len(groups)):
                    p_raw = _finite_p(raw.iloc[i, j])
                    p_adj = _finite_p(adj.iloc[i, j])
                    pairs.append({
                        "groupA": group_labels[i],
                        "groupB": group_labels[j],
                        "pValueRaw": p_raw,
                        "pValueCorrected": p_adj,
                        "significant": bool(p_adj is not None and p_adj < POSTHOC_ALPHA),
                    })
            return {"reason": reason, "correction": "holm", "method": "dunn", "pairs": pairs}
        except Exception:
            return None

    if is_categorical and test_name in ("Chi-square", "Fisher's exact", "Fisher's exact (Monte Carlo)"):
        raw_pairs = []
        pvals = []
        for i in range(len(groups)):
            for j in range(i + 1, len(groups)):
                pair_df = df_group[df_group[group_var].isin([groups[i], groups[j]])]
                contingency = pd.crosstab(pair_df[var], pair_df[group_var]).reindex(columns=[groups[i], groups[j]], fill_value=0)
                p_raw = None
                per_pair_test = "Fisher's exact"
                try:
                    _, _, _, expected = stats.chi2_contingency(contingency, correction=yates)
                    if float(expected.min()) >= 5:
                        chi2, p_chi, _, _ = stats.chi2_contingency(contingency, correction=yates)
                        p_raw = _finite_p(p_chi)
                        per_pair_test = "Chi-square"
                    else:
                        if contingency.shape == (2, 2):
                            result = stats.fisher_exact(contingency)
                        else:
                            result = stats.fisher_exact(contingency, method=stats.MonteCarloMethod(rng=rng))
                            per_pair_test = "Fisher's exact (Monte Carlo)"
                        p_raw = _finite_p(result.pvalue)
                except Exception:
                    p_raw = None
                raw_pairs.append((group_labels[i], group_labels[j], p_raw, per_pair_test))
                if p_raw is not None:
                    pvals.append(p_raw)
        corrected_iter = iter(multipletests(pvals, method="holm")[1].tolist() if pvals else [])
        pairs = []
        for a, b, p_raw, per_pair_test in raw_pairs:
            p_corr = float(next(corrected_iter)) if p_raw is not None else None
            pairs.append({
                "groupA": a,
                "groupB": b,
                "pValueRaw": p_raw,
                "pValueCorrected": p_corr,
                "perPairTest": per_pair_test,
                "significant": bool(p_corr is not None and p_corr < POSTHOC_ALPHA),
            })
        return {"reason": reason, "correction": "holm", "method": "pairwise_chi_square_fisher", "pairs": pairs}

    return None


def _clean_summary_series(series, is_categorical):
    clean = series.dropna()
    if is_categorical:
        return clean
    return pd.to_numeric(clean, errors="coerce").dropna().astype(float)


def _map_continuous_override(js_override):
    if js_override in ('mann_whitney_u', 'kruskal_wallis'):
        return 'mannwhitney'
    if js_override == 't_test':
        return 'student'
    if js_override == 'welch_t_test':
        return 'welch'
    if js_override == 'oneway_anova':
        return 'anova'
    return None


def _categorical_auto_method(contingency, min_exp):
    if min_exp is not None and min_exp < 5:
        return "Fisher's exact (Monte Carlo)" if contingency.shape != (2, 2) else "Fisher's exact"
    return "Chi-square"


def _cochran_sparse_note(expected):
    try:
        expected = np.asarray(expected, dtype=float)
        if expected.size and expected.size > 4 and float(np.mean(expected < 5)) > 0.2:
            return "More than 20% of expected counts were below 5; sparse-table assumptions should be reviewed."
    except Exception:
        pass
    return None


def _json_safe_smd(value):
    if value is None:
        return None
    try:
        value = float(value)
        if np.isposinf(value):
            return SMD_CAPPED_SENTINEL
        if np.isneginf(value) or np.isnan(value):
            return None
        return value
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def run_table1(data_json, plan_json):
    """
    Run statistical tests for Table 1 generation.

    Outlier action semantics (per PLAN.md §3.3):
      - 'keep'      : no change.
      - 'exclude'   : the value at that rowIndex is set to NaN (column-only).
                      Other columns in that row are NOT affected.
      - 'winsorize' : COLUMN-WIDE percentile cap using winsorizeBound from the
                      first winsorize action found for this column. Per-row
                      rowIndex is informational only — see PLAN.md §3.3.
    """
    data = json.loads(data_json)
    plan = json.loads(plan_json)

    if 'randomSeed' not in plan:
        raise KeyError("Analysis plan is missing required 'randomSeed' parameter.")
    seed_val = plan['randomSeed']
    rng = np.random.default_rng(seed_val)

    col_names = [c['name'] for c in data['columns']]
    df = pd.DataFrame(data['rows'], columns=col_names)

    group_var = plan.get('groupingVariable')
    inc_vars  = plan.get('includedVariables', [])
    var_config = plan.get('variableConfig', {})

    # ── Apply outlier actions ────────────────────────────────────────────────
    for col, conf in var_config.items():
        if col not in df.columns:
            continue
        outlier_actions = conf.get('outlierActions', [])

        # Exclude: set that row's value to NaN — rowIndex IS authoritative
        exclude_indices = [a['rowIndex'] for a in outlier_actions if a['action'] == 'exclude']
        if exclude_indices:
            df.loc[exclude_indices, col] = np.nan

        # Winsorize: COLUMN-WIDE cap; rowIndex is informational only
        winsorize_actions = [a for a in outlier_actions if a['action'] == 'winsorize']
        if winsorize_actions:
            bound = winsorize_actions[0].get('winsorizeBound', 'p01_p99')
            lim_map = {
                'p01_p99':   (0.01,  0.01),
                'p025_p975': (0.025, 0.025),
                'p05_p95':   (0.05,  0.05),
            }
            lim = lim_map.get(bound, (0.01, 0.01))
            mask = df[col].notna()
            if mask.sum() > 1:
                df.loc[mask, col] = np.array(
                    winsorize(df.loc[mask, col].astype(float), limits=lim)
                )

    # ── D30: Group ordering by frequency, with user override ─────────────────
    if group_var and group_var in df.columns:
        df_group = df.dropna(subset=[group_var])
        present = df_group[group_var].dropna()
        freq = present.value_counts()          # descending by count
        present_groups = freq.index.tolist()

        user_order = plan.get('groupOrder') or []
        if user_order and set(map(str, user_order)) >= set(map(str, present_groups)):
            order_map = {str(g): i for i, g in enumerate(user_order)}
            groups = sorted(present_groups, key=lambda g: order_map.get(str(g), len(user_order)))
        else:
            # Frequency desc, lexicographic asc tiebreak
            groups = sorted(present_groups, key=lambda g: (-int(freq[g]), str(g)))

        group_data = [df_group[df_group[group_var] == g] for g in groups]
        n_min = min(len(g) for g in group_data) if group_data else 0
        total_n = len(df_group)
    else:
        df_group = df
        groups = []
        group_data = []
        n_min = len(df)
        total_n = len(df)

    # Map test overrides
    test_overrides = plan.get('testOverrides', [])
    overrides_map = {o['variable']: o['method'] for o in test_overrides}

    results = []

    for var in inc_vars:
        if var not in df.columns or var == group_var:
            continue

        conf      = var_config.get(var, {})
        treat_as  = conf.get('treatAs', 'continuous')
        notes: list[str] = []
        is_categorical = ('categorical' in treat_as) or (treat_as == 'binary')

        # ── (S-15) Pre-validate numeric columns ──────────────────────────────
        if not is_categorical:
            coercion_failed = False
            for g_df in group_data:
                try:
                    pd.to_numeric(g_df[var], errors='raise')
                except (ValueError, TypeError):
                    coercion_failed = True
                    break
            if coercion_failed:
                notes.append(
                    f"Variable '{var}' is configured as continuous but contains non-numeric "
                    f"values. Skipping statistical test. Reclassify as categorical or clean the data."
                )
                results.append({
                    'variable':       var,
                    'summaryByGroup': {},
                    'overallSummary': {},
                    'test': {'name': 'None', 'statistic': None, 'pValue': None, 'df': None},
                    'smd':   None,
                    'notes': notes,
                    'plotData':       {'type': 'continuous', 'raw': []},
                })
                continue

        # ── Per-group summaries ──────────────────────────────────────────────
        summary_by_group: dict = {}
        var_groups_data: list = []

        for g_val, g_df in zip(groups, group_data):
            clean_s = _clean_summary_series(g_df[var], is_categorical)
            var_groups_data.append(clean_s)

            if is_categorical:
                counts = clean_s.value_counts().to_dict()
                pct    = (clean_s.value_counts(normalize=True) * 100).to_dict()
                summary_by_group[str(g_val)] = {
                    'counts':      {str(k): int(v)   for k, v in counts.items()},
                    'percentages': {str(k): float(v) for k, v in pct.items()},
                    'n': int(len(clean_s)),
                }
            else:
                if len(clean_s) > 0:
                    summary_by_group[str(g_val)] = {
                        'mean':   float(clean_s.mean()),
                        'sd':     float(clean_s.std(ddof=1)) if len(clean_s) > 1 else None,
                        'median': float(clean_s.median()),
                        'q25':    float(clean_s.quantile(0.25)),
                        'q75':    float(clean_s.quantile(0.75)),
                        'min':    float(clean_s.min()),
                        'max':    float(clean_s.max()),
                        'n':      int(len(clean_s)),
                    }
                else:
                    summary_by_group[str(g_val)] = {'n': 0}

        # ── Overall summary ──────────────────────────────────────────────────
        clean_all = _clean_summary_series(df_group[var], is_categorical)

        if is_categorical:
            counts = clean_all.value_counts().to_dict()
            pct    = (clean_all.value_counts(normalize=True) * 100).to_dict()
            overall = {
                'counts':      {str(k): int(v)   for k, v in counts.items()},
                'percentages': {str(k): float(v) for k, v in pct.items()},
                'n': int(len(clean_all)),
            }
        else:
            if len(clean_all) > 0:
                overall = {
                    'mean':   float(clean_all.mean()),
                    'sd':     float(clean_all.std(ddof=1)) if len(clean_all) > 1 else None,
                    'median': float(clean_all.median()),
                    'q25':    float(clean_all.quantile(0.25)),
                    'q75':    float(clean_all.quantile(0.75)),
                    'min':    float(clean_all.min()),
                    'max':    float(clean_all.max()),
                    'n':      int(len(clean_all)),
                }
            else:
                overall = {'n': 0}

        # ── Statistical test ─────────────────────────────────────────────────
        test_name = 'None'
        pval      = None
        stat      = None
        df_deg    = None
        fisher_or = None   # populated for Fisher's exact
        test_to_run = 'None'

        # Map JS-style override method name to python internal method name
        js_override = overrides_map.get(var)
        override = _map_continuous_override(js_override)
        if js_override == 'chi_square':
            override = 'chisquare'
        elif js_override == 'fishers_exact':
            override = 'fisher'
        
        if not override:
            override = conf.get('statisticalTestOverride')

        # (D29) Yates' correction: off by default
        yates = bool(conf.get('chiSquareYatesCorrection', False))

        auto_method = 'None'
        min_exp = None
        min_shapiro_p = None
        levene_p = None
        normal = True
        normality_method = None

        if len(groups) >= 2:
            any_empty = any(len(g) == 0 for g in var_groups_data)

            if is_categorical:
                try:
                    contingency = pd.crosstab(df_group[var], df_group[group_var])
                except Exception:
                    notes.append('Could not build contingency table.')
                    contingency = pd.DataFrame()

                if contingency.shape[0] > 1 and contingency.shape[1] > 1:
                    try:
                        _, _, _, expected = stats.chi2_contingency(contingency, correction=yates)
                        min_exp = float(expected.min())
                        sparse_note = _cochran_sparse_note(expected)
                        if sparse_note:
                            notes.append(sparse_note)
                    except Exception:
                        min_exp = 0.0

                    auto_method = _categorical_auto_method(contingency, min_exp)

                    if not override:
                        test_to_run = 'fisher' if min_exp < 5 else 'chisquare'
                    else:
                        test_to_run = override

                    try:
                        if test_to_run == 'fisher':
                            # scipy >= 1.15 supports R×C Fisher exact natively
                            try:
                                if contingency.shape == (2, 2):
                                    result = stats.fisher_exact(contingency)
                                    stat      = None
                                    fisher_or = float(np.asarray(result.statistic).item())
                                else:
                                    method = stats.MonteCarloMethod(rng=rng)
                                    result = stats.fisher_exact(contingency, method=method)
                                    stat      = None
                                    fisher_or = None
                                    notes.append("Fisher's exact P-value was estimated with seeded Monte Carlo sampling.")
                                pval      = float(np.asarray(result.pvalue).item())
                                test_name = "Fisher's exact (Monte Carlo)" if contingency.shape != (2, 2) else "Fisher's exact"
                            except Exception as e:
                                # Defensive: scipy may add a runtime guardrail for huge tables.
                                chi2, pval_chi, dof, _ = stats.chi2_contingency(contingency, correction=False)
                                stat      = float(chi2)
                                pval      = float(pval_chi)
                                df_deg    = int(dof)
                                test_name = 'Chi-square'
                                notes.append(
                                    f"Minimum expected count < 5; Fisher's exact failed ({type(e).__name__}). "
                                    "Fell back to chi-square. Result may be unreliable for low expected cell counts."
                                )
                        else:
                            chi2, pval_chi, dof, _ = stats.chi2_contingency(contingency, correction=yates)
                            stat      = float(chi2)
                            pval      = float(pval_chi)
                            df_deg    = int(dof)
                            test_name = 'Chi-square'
                            if yates:
                                notes.append("Yates' continuity correction applied.")
                    except Exception as e:
                        notes.append(f'Test failed: {e}')

                else:
                    notes.append('Variable is constant or groups have no variability.')

            else:
                if any_empty:
                    notes.append('One or more groups have no valid observations.')
                else:
                    normal = True
                    normal, min_shapiro_p, normality_method = _normality_check(var_groups_data)

                    if len(groups) == 2:
                        auto_method = "Welch's t-test" if normal else "Mann-Whitney U"
                    else:
                        auto_method = "ANOVA" if normal else "Kruskal-Wallis"

                    if not override:
                        test_to_run = ('welch' if normal else 'mannwhitney') if len(groups) == 2 \
                            else ('anova' if normal else 'kruskal')
                    else:
                        test_to_run = override

                    try:
                        if test_to_run in ('student', 'welch', 'ttest', 'anova'):
                            if len(groups) == 2:
                                s, p = stats.ttest_ind(
                                    var_groups_data[0].astype(float),
                                    var_groups_data[1].astype(float),
                                    equal_var=(test_to_run == 'student'),
                                )
                                stat, pval, test_name = float(s), float(p), "Student's t-test" if test_to_run == 'student' else "Welch's t-test"
                            else:
                                arrays = [g.astype(float) for g in var_groups_data]
                                if test_to_run == 'anova':
                                    try:
                                        _, p_lev = stats.levene(*arrays, center='median')
                                        levene_p = float(p_lev) if np.isfinite(p_lev) else None
                                        if levene_p is not None and levene_p < 0.05:
                                            notes.append(HETEROSCEDASTIC_ANOVA_NOTE)
                                    except Exception:
                                        levene_p = None
                                s, p = stats.f_oneway(*arrays)
                                stat, pval, test_name = float(s), float(p), 'ANOVA'
                        else:
                            if len(groups) == 2:
                                s, p = stats.mannwhitneyu(
                                    var_groups_data[0].astype(float),
                                    var_groups_data[1].astype(float),
                                    alternative='two-sided',
                                )
                                stat, pval, test_name = float(s), float(p), 'Mann-Whitney U'
                            else:
                                arrays = [g.astype(float) for g in var_groups_data]
                                s, p = stats.kruskal(*arrays)
                                stat, pval, test_name = float(s), float(p), 'Kruskal-Wallis'

                        # Guard against nan/inf from degenerate data
                        if stat is not None and (np.isnan(stat) or np.isinf(stat)):
                            stat = None
                        if pval is not None and (np.isnan(pval) or np.isinf(pval)):
                            pval = None

                    except Exception as e:
                        notes.append(f'Test failed: {e}')

        # ── SMD ──────────────────────────────────────────────────────────────
        smd = None
        if len(groups) >= 2 and plan.get('showSMD', True):
            try:
                if is_categorical:
                    contingency = pd.crosstab(df_group[var], df_group[group_var])
                    smds = []
                    for i in range(len(groups)):
                        for j in range(i + 1, len(groups)):
                            g_i, g_j = groups[i], groups[j]
                            if g_i in contingency.columns and g_j in contingency.columns:
                                s = calc_smd_categorical(contingency[g_i], contingency[g_j])
                                if not np.isnan(s):
                                    smds.append(s)
                    smd = float(np.max(smds)) if smds else None
                else:
                    smds = []
                    for i in range(len(groups)):
                        for j in range(i + 1, len(groups)):
                            s = calc_smd_continuous(
                                var_groups_data[i].astype(float),
                                var_groups_data[j].astype(float),
                            )
                            if not np.isnan(s):
                                smds.append(s)
                    smd = float(np.max(smds)) if smds else None
            except Exception:
                smd = None
            smd = _json_safe_smd(smd)

        # ── Build test object (S-5: auxiliary for Fisher OR) ─────────────────
        test_obj: dict = {
            'name':      test_name,
            'statistic': float(stat) if stat is not None else None,
            'pValue':    float(pval) if pval is not None else None,
            'df':        int(df_deg) if df_deg is not None else None,
        }
        aux = {}
        if is_categorical:
            aux['autoMethod'] = auto_method
            if min_exp is not None:
                aux['minExpectedCount'] = float(min_exp)
            contradicted = (test_to_run == 'chisquare' and min_exp is not None and min_exp < 5)
            aux['assumptionCheckContradicted'] = "true" if contradicted else "false"
        else:
            aux['autoMethod'] = auto_method
            if min_shapiro_p is not None:
                aux['shapiroPValue'] = float(min_shapiro_p)
            if normality_method is not None:
                aux['normalityMethod'] = normality_method
            if levene_p is not None:
                aux['levenePValue'] = float(levene_p)
            contradicted = (test_to_run in ('student', 'welch', 'ttest', 'anova') and not normal) or (test_to_run == 'anova' and levene_p is not None and levene_p < 0.05)
            aux['assumptionCheckContradicted'] = "true" if contradicted else "false"

        if test_name == "Fisher's exact" and fisher_or is not None:
            aux['oddsRatio'] = fisher_or
        test_obj['auxiliary'] = aux
        
        plot_data = compute_plot_data(df_group, var, group_var, is_categorical)
        result_entry = {
            'variable':       var,
            'summaryByGroup': summary_by_group,
            'overallSummary': overall,
            'test':           test_obj,
            'smd':            smd,
            'notes':          notes,
            'plotData':       plot_data,
        }
        result_entry["_posthoc_ctx"] = {
            "test_name": test_name,
            "groups": groups,
            "var_groups_data": var_groups_data,
            "var": var,
            "is_categorical": is_categorical,
            "yates": yates,
        }
        results.append(result_entry)

    # ── Multiple-testing correction ──────────────────────────────────────────
    mtc = plan.get('multipleTestingCorrection', 'none')
    if mtc != 'none':
        valid_idx = [i for i, r in enumerate(results) if r['test']['pValue'] is not None]
        pvals     = [results[i]['test']['pValue'] for i in valid_idx]
        if pvals:
            meth = 'fdr_bh' if mtc == 'bh' else mtc
            try:
                _, corrected, _, _ = multipletests(pvals, method=meth)
                for idx, cp in zip(valid_idx, corrected):
                    # (S-2) originalPValue must be a Python float, not numpy
                    results[idx]['test']['originalPValue'] = float(results[idx]['test']['pValue'])
                    results[idx]['test']['pValue'] = float(cp)
                    results[idx]['notes'].append(f'P-value adjusted via {mtc}')
            except Exception:
                pass
    # When mtc=='none', originalPValue is intentionally absent (field is optional)

    for r in results:
        ctx = r.pop("_posthoc_ctx", None)
        if ctx is None:
            continue
        omnibus_p = r["test"]["pValue"]
        posthoc = compute_posthoc(
            ctx["test_name"], ctx["groups"], ctx["var_groups_data"],
            df_group, ctx["var"], group_var, ctx["is_categorical"],
            omnibus_p, rng, ctx["yates"],
        )
        if posthoc is not None:
            r["postHoc"] = posthoc

    # ── Return ────────────────────────────────────────────────────────────────
    import statsmodels
    group_summary = []
    if group_var and group_var in df_group.columns:
        for g in groups:
            group_summary.append({'name': str(g), 'n': int((df_group[group_var] == g).sum())})

    return json.dumps({
        'perVariable': results,
        'groups':      group_summary,
        'totalN':      int(total_n),
        'computeMetadata': {
            'libVersions': {
                'numpy':       np.__version__,
                'pandas':      pd.__version__,
                'scipy':       scipy.__version__,
                'statsmodels': statsmodels.__version__,
            },
            'seed': plan['randomSeed'],
        },
    })


def recompute_variable(data_json, plan_json, target_var, method_override=None, existing_raw_pvals_json=None):
    """
    Recompute statistics and test for a single variable, supporting overrides.
    """
    data = json.loads(data_json)
    plan = json.loads(plan_json)

    if 'randomSeed' not in plan:
        raise KeyError("Analysis plan is missing required 'randomSeed' parameter.")
    seed_val = plan['randomSeed']
    rng = np.random.default_rng(seed_val)

    col_names = [c['name'] for c in data['columns']]
    df = pd.DataFrame(data['rows'], columns=col_names)

    group_var = plan.get('groupingVariable')
    var_config = plan.get('variableConfig', {})

    # Apply outlier actions
    if target_var in df.columns:
        conf = var_config.get(target_var, {})
        outlier_actions = conf.get('outlierActions', [])

        exclude_indices = [a['rowIndex'] for a in outlier_actions if a['action'] == 'exclude']
        if exclude_indices:
            df.loc[exclude_indices, target_var] = np.nan

        winsorize_actions = [a for a in outlier_actions if a['action'] == 'winsorize']
        if winsorize_actions:
            bound = winsorize_actions[0].get('winsorizeBound', 'p01_p99')
            lim_map = {
                'p01_p99':   (0.01,  0.01),
                'p025_p975': (0.025, 0.025),
                'p05_p95':   (0.05,  0.05),
            }
            lim = lim_map.get(bound, (0.01, 0.01))
            mask = df[target_var].notna()
            if mask.sum() > 1:
                df.loc[mask, target_var] = np.array(
                    winsorize(df.loc[mask, target_var].astype(float), limits=lim)
                )

    # Group ordering by frequency
    if group_var and group_var in df.columns:
        df_group = df.dropna(subset=[group_var])
        present = df_group[group_var].dropna()
        freq = present.value_counts()
        present_groups = freq.index.tolist()

        user_order = plan.get('groupOrder') or []
        if user_order and set(map(str, user_order)) >= set(map(str, present_groups)):
            order_map = {str(g): i for i, g in enumerate(user_order)}
            groups = sorted(present_groups, key=lambda g: order_map.get(str(g), len(user_order)))
        else:
            groups = sorted(present_groups, key=lambda g: (-int(freq[g]), str(g)))

        group_data = [df_group[df_group[group_var] == g] for g in groups]
        n_min = min(len(g) for g in group_data) if group_data else 0
        total_n = len(df_group)
    else:
        df_group = df
        groups = []
        group_data = []
        n_min = len(df)
        total_n = len(df)

    conf = var_config.get(target_var, {})
    treat_as = conf.get('treatAs', 'continuous')
    notes = []
    is_categorical = ('categorical' in treat_as) or (treat_as == 'binary')

    # Engine-side cross-type rejection: raise ValueError on mismatched type/method
    if method_override:
        num_g = len(groups)
        if is_categorical:
            allowed = ('chi_square', 'fishers_exact')
            if method_override not in allowed:
                raise ValueError(f"Method '{method_override}' is not allowed for categorical variable '{target_var}'")
        else:
            if num_g == 2:
                allowed = ('mann_whitney_u', 't_test', 'welch_t_test')
            else:
                allowed = ('kruskal_wallis', 'oneway_anova')
            if method_override not in allowed:
                raise ValueError(f"Method '{method_override}' is not allowed for continuous variable '{target_var}' with {num_g} groups")

    # Coercion validation
    if not is_categorical:
        coercion_failed = False
        for g_df in group_data:
            try:
                pd.to_numeric(g_df[target_var], errors='raise')
            except (ValueError, TypeError):
                coercion_failed = True
                break
        if coercion_failed:
            notes.append(
                f"Variable '{target_var}' is configured as continuous but contains non-numeric "
                f"values. Skipping statistical test. Reclassify as categorical or clean the data."
            )
            return json.dumps({
                'variable':       target_var,
                'summaryByGroup': {},
                'overallSummary': {},
                'test': {'name': 'None', 'statistic': None, 'pValue': None, 'df': None},
                'smd':   None,
                'notes': notes,
                'plotData':       {'type': 'continuous', 'raw': []},
            })

    # Per-group summaries
    summary_by_group = {}
    var_groups_data = []

    for g_val, g_df in zip(groups, group_data):
        clean_s = _clean_summary_series(g_df[target_var], is_categorical)
        var_groups_data.append(clean_s)

        if is_categorical:
            counts = clean_s.value_counts().to_dict()
            pct    = (clean_s.value_counts(normalize=True) * 100).to_dict()
            summary_by_group[str(g_val)] = {
                'counts':      {str(k): int(v)   for k, v in counts.items()},
                'percentages': {str(k): float(v) for k, v in pct.items()},
                'n': int(len(clean_s)),
            }
        else:
            if len(clean_s) > 0:
                summary_by_group[str(g_val)] = {
                    'mean':   float(clean_s.mean()),
                    'sd':     float(clean_s.std(ddof=1)) if len(clean_s) > 1 else None,
                    'median': float(clean_s.median()),
                    'q25':    float(clean_s.quantile(0.25)),
                    'q75':    float(clean_s.quantile(0.75)),
                    'min':    float(clean_s.min()),
                    'max':    float(clean_s.max()),
                    'n':      int(len(clean_s)),
                }
            else:
                summary_by_group[str(g_val)] = {'n': 0}

    # Overall summary
    clean_all = _clean_summary_series(df_group[target_var], is_categorical)

    if is_categorical:
        counts = clean_all.value_counts().to_dict()
        pct    = (clean_all.value_counts(normalize=True) * 100).to_dict()
        overall = {
            'counts':      {str(k): int(v)   for k, v in counts.items()},
            'percentages': {str(k): float(v) for k, v in pct.items()},
            'n': int(len(clean_all)),
        }
    else:
        if len(clean_all) > 0:
            overall = {
                'mean':   float(clean_all.mean()),
                'sd':     float(clean_all.std(ddof=1)) if len(clean_all) > 1 else None,
                'median': float(clean_all.median()),
                'q25':    float(clean_all.quantile(0.25)),
                'q75':    float(clean_all.quantile(0.75)),
                'min':    float(clean_all.min()),
                'max':    float(clean_all.max()),
                'n':      int(len(clean_all)),
            }
        else:
            overall = {'n': 0}

    # Statistical test
    test_name = 'None'
    pval      = None
    stat      = None
    df_deg    = None
    fisher_or = None
    test_to_run = 'None'

    override = _map_continuous_override(method_override)
    if method_override == 'chi_square':
        override = 'chisquare'
    elif method_override == 'fishers_exact':
        override = 'fisher'

    if not override:
        override = conf.get('statisticalTestOverride')

    yates = bool(conf.get('chiSquareYatesCorrection', False))

    auto_method = 'None'
    min_exp = None
    min_shapiro_p = None
    levene_p = None
    normal = True
    normality_method = None

    if len(groups) >= 2:
        any_empty = any(len(g) == 0 for g in var_groups_data)

        if is_categorical:
            try:
                contingency = pd.crosstab(df_group[target_var], df_group[group_var])
            except Exception:
                notes.append('Could not build contingency table.')
                contingency = pd.DataFrame()

            if contingency.shape[0] > 1 and contingency.shape[1] > 1:
                try:
                    _, _, _, expected = stats.chi2_contingency(contingency, correction=yates)
                    min_exp = float(expected.min())
                    sparse_note = _cochran_sparse_note(expected)
                    if sparse_note:
                        notes.append(sparse_note)
                except Exception:
                    min_exp = 0.0

                auto_method = _categorical_auto_method(contingency, min_exp)

                if not override:
                    test_to_run = 'fisher' if min_exp < 5 else 'chisquare'
                else:
                    test_to_run = override

                try:
                    if test_to_run == 'fisher':
                        try:
                            if contingency.shape == (2, 2):
                                result = stats.fisher_exact(contingency)
                                stat      = None
                                fisher_or = float(np.asarray(result.statistic).item())
                            else:
                                method = stats.MonteCarloMethod(rng=rng)
                                result = stats.fisher_exact(contingency, method=method)
                                stat      = None
                                fisher_or = None
                                notes.append("Fisher's exact P-value was estimated with seeded Monte Carlo sampling.")
                            pval      = float(np.asarray(result.pvalue).item())
                            test_name = "Fisher's exact (Monte Carlo)" if contingency.shape != (2, 2) else "Fisher's exact"
                        except Exception as e:
                            chi2, pval_chi, dof, _ = stats.chi2_contingency(contingency, correction=False)
                            stat      = float(chi2)
                            pval      = float(pval_chi)
                            df_deg    = int(dof)
                            test_name = 'Chi-square'
                            notes.append(
                                f"Minimum expected count < 5; Fisher's exact failed ({type(e).__name__}). "
                                "Fell back to chi-square. Result may be unreliable for low expected cell counts."
                            )
                    else:
                        chi2, pval_chi, dof, _ = stats.chi2_contingency(contingency, correction=yates)
                        stat      = float(chi2)
                        pval      = float(pval_chi)
                        df_deg    = int(dof)
                        test_name = 'Chi-square'
                        if yates:
                            notes.append("Yates' continuity correction applied.")
                except Exception as e:
                    notes.append(f'Test failed: {e}')
            else:
                notes.append('Variable is constant or groups have no variability.')

        else:
            if any_empty:
                notes.append('One or more groups have no valid observations.')
            else:
                normal = True
                normal, min_shapiro_p, normality_method = _normality_check(var_groups_data)

                if len(groups) == 2:
                    auto_method = "Welch's t-test" if normal else "Mann-Whitney U"
                else:
                    auto_method = "ANOVA" if normal else "Kruskal-Wallis"

                if not override:
                    test_to_run = ('welch' if normal else 'mannwhitney') if len(groups) == 2 \
                        else ('anova' if normal else 'kruskal')
                else:
                    test_to_run = override

                try:
                    if test_to_run in ('student', 'welch', 'ttest', 'anova'):
                        if len(groups) == 2:
                            s, p = stats.ttest_ind(
                                var_groups_data[0].astype(float),
                                var_groups_data[1].astype(float),
                                equal_var=(test_to_run == 'student'),
                            )
                            stat, pval, test_name = float(s), float(p), "Student's t-test" if test_to_run == 'student' else "Welch's t-test"
                        else:
                            arrays = [g.astype(float) for g in var_groups_data]
                            if test_to_run == 'anova':
                                try:
                                    _, p_lev = stats.levene(*arrays, center='median')
                                    levene_p = float(p_lev) if np.isfinite(p_lev) else None
                                    if levene_p is not None and levene_p < 0.05:
                                        notes.append(HETEROSCEDASTIC_ANOVA_NOTE)
                                except Exception:
                                    levene_p = None
                            s, p = stats.f_oneway(*arrays)
                            stat, pval, test_name = float(s), float(p), 'ANOVA'
                    else:
                        if len(groups) == 2:
                            s, p = stats.mannwhitneyu(
                                var_groups_data[0].astype(float),
                                var_groups_data[1].astype(float),
                                alternative='two-sided',
                            )
                            stat, pval, test_name = float(s), float(p), 'Mann-Whitney U'
                        else:
                            arrays = [g.astype(float) for g in var_groups_data]
                            s, p = stats.kruskal(*arrays)
                            stat, pval, test_name = float(s), float(p), 'Kruskal-Wallis'

                    if stat is not None and (np.isnan(stat) or np.isinf(stat)):
                        stat = None
                    if pval is not None and (np.isnan(pval) or np.isinf(pval)):
                        pval = None
                except Exception as e:
                    notes.append(f'Test failed: {e}')

    # SMD
    smd = None
    if len(groups) >= 2 and plan.get('showSMD', True):
        try:
            if is_categorical:
                contingency = pd.crosstab(df_group[target_var], df_group[group_var])
                smds = []
                for i in range(len(groups)):
                    for j in range(i + 1, len(groups)):
                        g_i, g_j = groups[i], groups[j]
                        if g_i in contingency.columns and g_j in contingency.columns:
                            s = calc_smd_categorical(contingency[g_i], contingency[g_j])
                            if not np.isnan(s):
                                smds.append(s)
                smd = float(np.max(smds)) if smds else None
            else:
                smds = []
                for i in range(len(groups)):
                    for j in range(i + 1, len(groups)):
                        s = calc_smd_continuous(
                            var_groups_data[i].astype(float),
                            var_groups_data[j].astype(float),
                        )
                        if not np.isnan(s):
                            smds.append(s)
                smd = float(np.max(smds)) if smds else None
        except Exception:
            smd = None
        smd = _json_safe_smd(smd)

    test_obj = {
        'name':      test_name,
        'statistic': float(stat) if stat is not None else None,
        'pValue':    float(pval) if pval is not None else None,
        'df':        int(df_deg) if df_deg is not None else None,
    }
    aux = {}
    if is_categorical:
        aux['autoMethod'] = auto_method
        if min_exp is not None:
            aux['minExpectedCount'] = float(min_exp)
        contradicted = (test_to_run == 'chisquare' and min_exp is not None and min_exp < 5)
        aux['assumptionCheckContradicted'] = "true" if contradicted else "false"
    else:
        aux['autoMethod'] = auto_method
        if min_shapiro_p is not None:
            aux['shapiroPValue'] = float(min_shapiro_p)
        if normality_method is not None:
            aux['normalityMethod'] = normality_method
        if levene_p is not None:
            aux['levenePValue'] = float(levene_p)
        contradicted = (test_to_run in ('student', 'welch', 'ttest', 'anova') and not normal) or (test_to_run == 'anova' and levene_p is not None and levene_p < 0.05)
        aux['assumptionCheckContradicted'] = "true" if contradicted else "false"

    if test_name == "Fisher's exact" and fisher_or is not None:
        aux['oddsRatio'] = fisher_or
    
    test_obj['auxiliary'] = aux

    # --- MTC first (moved up from below) ---
    omnibus_p_for_posthoc = pval
    adjusted_pvalues = None
    mtc = plan.get('multipleTestingCorrection', 'none')
    if mtc != 'none' and pval is not None and existing_raw_pvals_json:
        try:
            raw_pvals_dict = json.loads(existing_raw_pvals_json)
            raw_pvals_dict[target_var] = pval
            vars_list = list(raw_pvals_dict.keys())
            pvals_list = [raw_pvals_dict[v] for v in vars_list]
            valid_indices = [i for i, pv in enumerate(pvals_list) if pv is not None]
            valid_pvals = [pvals_list[i] for i in valid_indices]
            if valid_pvals:
                meth = 'fdr_bh' if mtc == 'bh' else mtc
                _, corrected, _, _ = multipletests(valid_pvals, method=meth)
                corrected_by_index = {idx: float(cp) for idx, cp in zip(valid_indices, corrected)}
                adjusted_pvalues = {
                    var: corrected_by_index[i] if i in corrected_by_index else None
                    for i, var in enumerate(vars_list)
                }
                target_idx = vars_list.index(target_var)
                if target_idx in valid_indices:
                    corrected_idx = valid_indices.index(target_idx)
                    corrected_p = float(corrected[corrected_idx])
                    test_obj['originalPValue'] = float(pval)
                    test_obj['pValue'] = corrected_p
                    omnibus_p_for_posthoc = corrected_p
                    notes.append(f'P-value adjusted via {mtc}')
        except Exception as e:
            notes.append(f'MTC adjustment failed in recompute: {e}')

    # --- Post-hoc gated on the effective (possibly adjusted) omnibus p ---
    posthoc = compute_posthoc(
        test_name, groups, var_groups_data, df_group, target_var,
        group_var, is_categorical, omnibus_p_for_posthoc, rng, yates,
    )

    plot_data = compute_plot_data(df_group, target_var, group_var, is_categorical)
    result_entry = {
        'variable':       target_var,
        'summaryByGroup': summary_by_group,
        'overallSummary': overall,
        'test':           test_obj,
        'smd':            smd,
        'notes':          notes,
        'plotData':       plot_data,
    }
    if posthoc is not None:
        result_entry['postHoc'] = posthoc
    if adjusted_pvalues is not None:
        return json.dumps({
            "result": result_entry,
            "adjustedPValues": adjusted_pvalues,
        })
    return json.dumps(result_entry)
