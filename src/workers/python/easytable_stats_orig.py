import json
import warnings
import numpy as np
import pandas as pd
import scipy.stats as stats
import scipy
from scipy.stats.mstats import winsorize
from statsmodels.stats.multitest import multipletests


# ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
# SMD helpers
# ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

def calc_smd_continuous(g1, g2):
    """Cohen's d with pooled SD (Yang & Dalton 2012 for 2-group continuous)."""
    m1, m2 = np.nanmean(g1), np.nanmean(g2)
    v1, v2 = np.nanvar(g1, ddof=1), np.nanvar(g2, ddof=1)
    if any(np.isnan(x) for x in [m1, m2, v1, v2]):
        return np.nan
    s_pooled = np.sqrt((v1 + v2) / 2)
    if s_pooled == 0:
        return 0.0
    return abs(m1 - m2) / s_pooled


def calc_smd_categorical(counts1, counts2):
    """
    Binary   ΓåÆ pooled-SD formula.
    Multi-cat ΓåÆ multivariate SMD per Yang & Dalton (2012); uses pinv for robustness.
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
        return abs(pr1 - pr2) / den if den > 0 else 0.0

    # k > 2: use k-1 categories (drop last)
    p1_k = p1.values[:-1]
    p2_k = p2.values[:-1]
    S1 = np.diag(p1_k) - np.outer(p1_k, p1_k)
    S2 = np.diag(p2_k) - np.outer(p2_k, p2_k)
    S = (S1 + S2) / 2
    diff = p1_k - p2_k
    try:
        # (S-7) use pinv ΓÇö never raises on singularity
        inv_S = np.linalg.pinv(S)
        smd2 = diff.T @ inv_S @ diff
        return float(np.sqrt(max(smd2, 0)))
    except Exception:
        return np.nan


# ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
# Main entry point
# ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

def run_table1(data_json, plan_json):
    """
    Run statistical tests for Table 1 generation.

    Outlier action semantics (per PLAN.md ┬º3.3):
      - 'keep'      : no change.
      - 'exclude'   : the value at that rowIndex is set to NaN (column-only).
                      Other columns in that row are NOT affected.
      - 'winsorize' : COLUMN-WIDE percentile cap using winsorizeBound from the
                      first winsorize action found for this column. Per-row
                      rowIndex is informational only ΓÇö see PLAN.md ┬º3.3.
    """
    data = json.loads(data_json)
    plan = json.loads(plan_json)

    col_names = [c['name'] for c in data['columns']]
    df = pd.DataFrame(data['rows'], columns=col_names)

    group_var = plan.get('groupingVariable')
    inc_vars  = plan.get('includedVariables', [])
    var_config = plan.get('variableConfig', {})

    # ΓöÇΓöÇ Apply outlier actions ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    for col, conf in var_config.items():
        if col not in df.columns:
            continue
        outlier_actions = conf.get('outlierActions', [])

        # Exclude: set that row's value to NaN ΓÇö rowIndex IS authoritative
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

    # ΓöÇΓöÇ D30: Group ordering by frequency, with user override ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

    results = []

    for var in inc_vars:
        if var not in df.columns or var == group_var:
            continue

        conf      = var_config.get(var, {})
        treat_as  = conf.get('treatAs', 'continuous')
        notes: list[str] = []
        is_categorical = ('categorical' in treat_as) or (treat_as == 'binary')

        # ΓöÇΓöÇ (S-15) Pre-validate numeric columns ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
                })
                continue

        # ΓöÇΓöÇ Per-group summaries ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
        summary_by_group: dict = {}
        var_groups_data: list = []

        for g_val, g_df in zip(groups, group_data):
            clean_s = g_df[var].dropna()
            try:
                clean_s = clean_s.astype(float)
            except (ValueError, TypeError):
                pass
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

        # ΓöÇΓöÇ Overall summary ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
        clean_all = df_group[var].dropna()
        try:
            clean_all = clean_all.astype(float)
        except (ValueError, TypeError):
            pass

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

        # ΓöÇΓöÇ Statistical test ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
        test_name = 'None'
        pval      = None
        stat      = None
        df_deg    = None
        fisher_or = None   # populated for Fisher's exact

        override = conf.get('statisticalTestOverride')
        # (D29) Yates' correction: off by default
        yates = bool(conf.get('chiSquareYatesCorrection', False))

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
                        min_exp = expected.min()
                    except Exception:
                        min_exp = 0

                    if not override:
                        if min_exp < 5:
                            test_to_run = 'fisher'
                        else:
                            test_to_run = 'chisquare'
                    else:
                        test_to_run = override

                    try:
                        if test_to_run == 'fisher':
                            # scipy >= 1.15 supports R├ùC Fisher exact natively
                            try:
                                result = stats.fisher_exact(contingency)
                                if contingency.shape == (2, 2):
                                    stat      = None
                                    fisher_or = float(np.asarray(result.statistic).item())
                                else:
                                    stat      = None
                                    fisher_or = None
                                pval      = float(np.asarray(result.pvalue).item())
                                test_name = "Fisher's exact"
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
                    test_to_run = override
                    if not test_to_run:
                        normal = True
                        if n_min <= 2000:
                            for g_s in var_groups_data:
                                if len(g_s) < 3:
                                    normal = False
                                    break
                                try:
                                    with warnings.catch_warnings():
                                        warnings.simplefilter('ignore')
                                        _, p_sw = stats.shapiro(g_s)
                                    if np.isnan(p_sw) or p_sw < 0.05:
                                        normal = False
                                        break
                                except Exception:
                                    normal = False
                                    break
                        else:
                            for g_s in var_groups_data:
                                try:
                                    sk = stats.skew(g_s, bias=False)
                                    ku = stats.kurtosis(g_s, bias=False, fisher=True)
                                    if abs(sk) >= 1 or abs(ku) >= 1:
                                        normal = False
                                        break
                                except Exception:
                                    normal = False
                                    break

                        test_to_run = ('ttest' if normal else 'mannwhitney') if len(groups) == 2 \
                            else ('anova' if normal else 'kruskal')

                    try:
                        if test_to_run in ('ttest', 'anova'):
                            if len(groups) == 2:
                                s, p = stats.ttest_ind(
                                    var_groups_data[0].astype(float),
                                    var_groups_data[1].astype(float),
                                    equal_var=False,
                                )
                                stat, pval, test_name = float(s), float(p), "Welch's t-test"
                            else:
                                arrays = [g.astype(float) for g in var_groups_data]
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

        # ΓöÇΓöÇ SMD ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

        # ΓöÇΓöÇ Build test object (S-5: auxiliary for Fisher OR) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
        test_obj: dict = {
            'name':      test_name,
            'statistic': float(stat) if stat is not None else None,
            'pValue':    float(pval) if pval is not None else None,
            'df':        int(df_deg) if df_deg is not None else None,
        }
        if test_name == "Fisher's exact" and fisher_or is not None:
            test_obj['auxiliary'] = {'oddsRatio': fisher_or}

        results.append({
            'variable':       var,
            'summaryByGroup': summary_by_group,
            'overallSummary': overall,
            'test':           test_obj,
            'smd':            smd,
            'notes':          notes,
        })

    # ΓöÇΓöÇ Multiple-testing correction ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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

    # ΓöÇΓöÇ Return ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
            'seed': plan.get('randomSeed', 42),
        },
    })
