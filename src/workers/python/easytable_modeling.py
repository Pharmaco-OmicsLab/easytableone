import json
import math
import warnings

import numpy as np
import pandas as pd
import statsmodels.api as sm


CATEGORICAL_TYPES = {"binary", "categorical_nominal", "categorical_ordinal"}
SIMPLE_POLICIES = {"mean", "median", "mode", "constant"}
ML_IMPUTER_POLICIES = {"knn", "rf"}
EPS = 1e-9
CLASSIFICATION_THRESHOLD = 0.5
CALIBRATION_STABILITY_BOUND = 10.0

warnings.filterwarnings("ignore", message=".*Perfect separation.*")
warnings.filterwarnings("ignore", message=".*Maximum Likelihood optimization failed.*")
warnings.filterwarnings("ignore", category=FutureWarning, module="sklearn.*")


class ModelingInputError(Exception):
    def __init__(self, message, unmatched=None, available=None):
        super().__init__(message)
        self.unmatched = unmatched or []
        self.available = available or []


def _loads(value):
    return json.loads(value) if isinstance(value, str) else value


def _to_jsonable(value):
    if value is None:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        if not np.isfinite(value):
            return None
        return float(value)
    if isinstance(value, (np.ndarray, pd.Series, list, tuple)):
        return [_to_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _to_jsonable(v) for k, v in value.items()}
    return value


def _dump(value):
    return json.dumps(_to_jsonable(value), allow_nan=False)


def _dataframe(data_json):
    data = _loads(data_json)
    columns = [c["name"] for c in data["columns"]]
    return pd.DataFrame(data["rows"], columns=columns)


def _schema_map(schema_json):
    schema = _loads(schema_json)
    return {c["name"]: c for c in schema.get("columns", [])}


def _term_label(term, schema):
    text = str(term)
    if "=" not in text:
        col = (schema or {}).get(text)
        label = col.get("displayLabel") if col else None
        return label or text, None, text, None

    variable, code = text.split("=", 1)
    col = (schema or {}).get(variable)
    variable_label = (col.get("displayLabel") if col else None) or variable
    level_label = code
    if col:
        for level in col.get("levels") or []:
            if str(level.get("code")) == code:
                level_label = level.get("label") or code
                break
    return variable_label, level_label, variable, code


def _format_level_code(code):
    # Strip a trailing ".0" that comes from categorical values stored as floats
    # (e.g. "2.0" -> "2"); leave genuine decimals and non-numeric codes intact.
    text = str(code)
    try:
        f = float(text)
        if f.is_integer():
            return str(int(f))
    except (TypeError, ValueError):
        pass
    return text


def _display_term_label(term, schema, reference_levels=None):
    variable_label, level_label, variable, code = _term_label(term, schema or {})
    if level_label is None:
        return variable_label  # numeric predictor: just the variable label
    shown = level_label if level_label != code else _format_level_code(code)
    ref = (reference_levels or {}).get(variable)
    ref_txt = f" (vs {_format_level_code(ref)})" if ref is not None else ""
    return f"{variable_label}: {shown}{ref_txt}"


def _numeric_equal(left, right):
    try:
        return float(str(left)) == float(str(right))
    except Exception:
        return False


def _resolve_outcome_level(code, outcome_schema):
    if code is None or not outcome_schema:
        return code
    text = str(code)
    for level in outcome_schema.get("levels") or []:
        level_code = level.get("code")
        if str(level_code) == text or _numeric_equal(level_code, text):
            return level.get("label") or text
    return text


def _input_error_payload(error, df=None):
    available = getattr(error, "available", None)
    if available is None and df is not None:
        available = list(df.columns)[:50]
    return _dump({
        "error": str(error),
        "unmatched": getattr(error, "unmatched", []),
        "available": available or [],
    })


def _resolve_columns(df, requested):
    normalized = {}
    ambiguous = set()
    for column in df.columns:
        key = str(column).strip()
        if key in normalized and normalized[key] != column:
            ambiguous.add(key)
        else:
            normalized[key] = column

    resolved = []
    unmatched = []
    for name in requested:
        if name in df.columns:
            resolved.append(name)
            continue
        key = str(name).strip()
        if key in normalized and key not in ambiguous:
            resolved.append(normalized[key])
        else:
            resolved.append(None)
            unmatched.append(name)
    return resolved, unmatched


def _natural_level_key(value):
    text = str(value).strip().lower()
    negative_rank = {"0": 0, "false": 0, "no": 0, "control": 0, "survival": 0, "none": 0}
    positive_rank = {"1": 1, "true": 1, "yes": 1, "case": 1, "event": 1, "death": 1}
    if text in negative_rank:
        return (0, text)
    if text in positive_rank:
        return (2, text)
    try:
        return (1, float(text))
    except Exception:
        return (1, text)


def _prepare_binary_y(series, outcome, outcome_schema=None, setup=None):
    clean = series.dropna()
    levels = list(pd.unique(clean))
    if len(levels) != 2:
        preview = [str(level) for level in levels[:6]]
        raise ModelingInputError(
            f"The outcome must have exactly 2 groups, but '{outcome}' has {len(levels)} non-missing value(s): {preview}. Pick a binary outcome, or exclude/relabel the extra levels."
        )
    setup = setup or {}
    positive = setup.get("outcomePositiveLevel")
    reference = (outcome_schema or {}).get("referenceLevel")
    level_by_string = {str(level): level for level in levels}
    if positive is not None and str(positive) in level_by_string:
        event = level_by_string[str(positive)]
        non_event = next(level for level in levels if str(level) != str(event))
    elif reference is not None and str(reference) in level_by_string:
        non_event = level_by_string[str(reference)]
        event = next(level for level in levels if str(level) != str(non_event))
    else:
        ordered = sorted(levels, key=_natural_level_key)
        non_event, event = ordered[0], ordered[-1]
    mapping = {non_event: 0, event: 1}
    y = series.map(mapping)
    return y.astype(float), mapping


def _design(df, schema, outcome, predictors, reference_levels=None, drop_missing=True, setup=None):
    reference_levels = reference_levels or {}
    requested = [outcome] + predictors
    resolved, unmatched = _resolve_columns(df, requested)
    if not resolved or resolved[0] is None:
        raise ModelingInputError(
            f"Outcome column '{outcome}' was not found in the data.",
            unmatched=[outcome],
            available=list(df.columns)[:50],
        )

    unmatched_predictors = [name for name in unmatched if name != outcome]
    predictor_pairs = []
    outcome_actual = resolved[0]
    for requested_name, resolved_name in zip(requested[1:], resolved[1:]):
        if resolved_name is None:
            continue
        predictor_pairs.append((requested_name, resolved_name))

    actual_cols = [outcome_actual] + [actual for _, actual in predictor_pairs]
    work = df[actual_cols].copy()
    work.columns = [outcome] + [requested_name for requested_name, _ in predictor_pairs]
    if drop_missing:
        work = work.dropna(axis=0, how="any")
    if len(work) == 0:
        raise ModelingInputError(
            "No complete rows remain for the selected outcome and predictors after removing missing values - reduce predictors or enable MICE imputation.",
            unmatched=unmatched_predictors,
            available=list(df.columns)[:50],
        )
    warnings_out = []
    y, y_mapping = _prepare_binary_y(work[outcome], outcome, schema.get(outcome, {}), setup)
    parts = []
    term_labels = []
    term_sources = []
    for name, _ in predictor_pairs:
        col = schema.get(name, {})
        if col.get("confirmedType") in CATEGORICAL_TYPES:
            series = work[name].astype("object")
            levels = list(pd.unique(series.dropna()))
            ref = reference_levels.get(name, col.get("referenceLevel", levels[0] if levels else None))
            if ref is not None and levels and not any(str(lvl) == str(ref) for lvl in levels):
                counts = series.dropna().value_counts()
                ref = counts.index[0] if len(counts) else levels[0]
                warnings_out.append(f"Reference level for '{name}' had no complete cases; using '{ref}' as reference.")
            levels = [lvl for lvl in levels if str(lvl) != str(ref)]
            for lvl in levels:
                term = f"{name}={lvl}"
                parts.append((series.astype(str) == str(lvl)).astype(float).rename(term))
                term_labels.append(term)
                term_sources.append(name)
        else:
            numeric = pd.to_numeric(work[name], errors="coerce")
            if numeric.isna().any() and drop_missing:
                mask = numeric.notna()
                work = work.loc[mask]
                y = y.loc[mask]
                numeric = numeric.loc[mask]
            parts.append(numeric.astype(float).rename(name))
            term_labels.append(name)
            term_sources.append(name)
    if parts:
        X = pd.concat(parts, axis=1).astype(float)
    else:
        X = pd.DataFrame(index=work.index)
    if len(X) == 0 or X.shape[1] == 0:
        raise ModelingInputError(
            "No model predictors remain after resolving columns and removing missing values - choose at least one valid predictor.",
            unmatched=unmatched_predictors,
            available=list(df.columns)[:50],
        )
    return X, y.astype(int), term_labels, term_sources, y_mapping, unmatched_predictors, warnings_out


def detect_regime(x_meta_json, y_json=None):
    meta = _loads(x_meta_json)
    counts = meta.get("class_counts") or {}
    n = int(meta.get("n", sum(counts.values()) if counts else 0))
    p = int(meta.get("p", 0))
    goal = meta.get("goal", "adjust")
    separation = bool(meta.get("separation", False))
    if y_json is not None:
        y = _loads(y_json)
        counts = {}
        for item in y:
            if item is not None:
                counts[str(item)] = counts.get(str(item), 0) + 1
        n = len([v for v in y if v is not None])
    events = min(counts.values()) if counts else int(meta.get("events", 0))
    nonevents = max(counts.values()) if counts else max(0, n - events)
    epv = events / p if p else 0
    p_ge_n = p >= n if n else False
    plain_allowed = epv >= 10 and not p_ge_n and not separation

    if separation:
        recommended = ["firth"]
        model_phrase = "using Firth logistic regression because separation was detected"
    elif goal == "select":
        recommended = ["lasso"]
        model_phrase = "using LASSO for variable selection"
    elif plain_allowed:
        recommended = ["plain", "ridge"]
        model_phrase = "standard logistic is allowed; ridge is also available for shrinkage"
    else:
        recommended = ["ridge"]
        model_phrase = "standard logistic is unreliable, using ridge with shrinkage"
    if p_ge_n:
        recommended = [m for m in recommended if m != "plain"]
        if not recommended:
            recommended = ["ridge"]
    rationale = f"n={n}, {events} events, {p} predictors -> EPV≈{epv:.1f}; {model_phrase}."
    if p_ge_n:
        rationale += " p >= n, so plain maximum-likelihood logistic regression is disabled."
    return _dump({
        "n": n,
        "events": events,
        "nonevents": nonevents,
        "p": p,
        "epv": epv,
        "p_ge_n": p_ge_n,
        "recommended_models": recommended,
        "plain_mle_allowed": plain_allowed,
        "rationale": rationale,
    })


def _separation_from_arrays(X, y):
    culprits = []
    for col in X.columns:
        values = X[col]
        if values.nunique(dropna=True) <= 1:
            continue
        uniq = set(pd.unique(values.dropna()))
        if not uniq or not uniq.issubset({0, 0.0, 1, 1.0}):
            continue
        for val in values.dropna().unique():
            mask = values == val
            if mask.sum() and y[mask].nunique() == 1 and mask.sum() >= 2:
                culprits.append(col)
                break
    separated = False
    quasi = False
    convergence_warning = False
    if len(X.columns) > 0:
        try:
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("ignore")
                fit = sm.Logit(y, sm.add_constant(X, has_constant="add")).fit(disp=False, maxiter=100)
            probs = fit.predict(sm.add_constant(X, has_constant="add"))
            coef = fit.params.drop(labels=["const"], errors="ignore")
            sd = X.std(ddof=0).replace(0, 1.0).reindex(coef.index).fillna(1.0)
            standardized = np.abs(coef * sd)
            large = bool(len(standardized) and np.nanmax(standardized.values) > 20)
            edge_probs = bool(((probs < 1e-6) | (probs > 1 - 1e-6)).any())
            warned = any("separation" in str(w.message).lower() or "converge" in str(w.message).lower() for w in caught)
            separated = bool(culprits)
            quasi = bool((large or edge_probs or warned) and not separated)
            convergence_warning = bool(warned and not separated and not (large or edge_probs))
        except Exception:
            separated = bool(culprits)
            quasi = not separated
            convergence_warning = not separated
    return {
        "separated": separated,
        "quasi": quasi,
        "convergence_warning": convergence_warning,
        "culprits": sorted(set(culprits)),
        "detection": "dummy_level_scan_plus_fit_diagnostics",
    }


def detect_separation(data_json, schema_json, outcome, predictors_json, reference_levels_json=None, setup_json=None):
    df = _dataframe(data_json)
    try:
        schema = _schema_map(schema_json)
        predictors = _loads(predictors_json)
        refs = _loads(reference_levels_json) if reference_levels_json else {}
        setup = _loads(setup_json) if setup_json else None
        X, y, _, _, _, unmatched, _ = _design(df, schema, outcome, predictors, refs, setup=setup)
        result = _separation_from_arrays(X, y)
        result["unmatched"] = unmatched
        return _dump(result)
    except ModelingInputError as exc:
        return _input_error_payload(exc, df)


def _or_row(label, beta, se=None, pvalue=None, ci=None, ci_method=None, selection_frequency=None):
    def safe_exp(value):
        if not np.isfinite(value) or value > 700 or value < -745:
            return None
        return math.exp(value)

    had_ci = ci is not None or (se is not None and np.isfinite(se))
    if ci is None and se is not None and np.isfinite(se):
        ci = (beta - 1.96 * se, beta + 1.96 * se)
    if ci is None:
        ci = (np.nan, np.nan)
    return {
        "label": label,
        "or": safe_exp(beta),
        "ci_low": safe_exp(ci[0]),
        "ci_high": safe_exp(ci[1]),
        "p": pvalue if pvalue is None or np.isfinite(pvalue) else None,
        "ci_method": ci_method or ("wald" if had_ci else "none"),
        "selection_frequency": selection_frequency,
    }


def _describe_term(term, schema=None):
    variable_label, level_label, variable, code = _term_label(term, schema or {})
    raw = str(term)
    if level_label is not None:
        return f"the '{level_label}' level of '{variable_label}' ('{raw}')"
    if variable_label != variable:
        return f"'{variable_label}' ('{raw}')"
    return f"'{raw}'"


def _describe_terms(terms, schema=None, limit=5):
    described = [_describe_term(term, schema) for term in terms]
    if len(described) <= limit:
        return ", ".join(described)
    return ", ".join(described[:limit]) + f", and {len(described) - limit} more"


def _find_redundant_columns(Xc):
    redundant = []
    kept = []
    rank = 0
    for col in Xc.columns:
        candidate = kept + [col]
        next_rank = np.linalg.matrix_rank(Xc[candidate].to_numpy(dtype=float))
        if next_rank <= rank:
            redundant.append(col)
        else:
            kept.append(col)
            rank = next_rank
    return redundant


def _diagnose_design(X, y, schema=None):
    if X is None or len(X) == 0 or X.shape[1] == 0:
        return None
    n = len(y) if y is not None else len(X)
    numeric = X.astype(float)

    for col in numeric.columns:
        values = numeric[col].to_numpy(dtype=float)
        nonfinite = int((~np.isfinite(values)).sum())
        if nonfinite > 0:
            return (
                f"Predictor {_describe_term(col, schema)} has {nonfinite} non-finite value(s) (NaN/Inf) after preparing the data. "
                f"This usually means a transform produced invalid numbers; remove or fix '{col}' and re-run."
            )

    for col in numeric.columns:
        series = numeric[col]
        if series.nunique(dropna=False) <= 1 or float(series.std(ddof=0)) == 0.0:
            return (
                f"Predictor {_describe_term(col, schema)} has only one value across the {n} rows used for modeling "
                "(it became constant after rows with missing data were dropped). A constant predictor can't be estimated - "
                f"exclude '{col}', or enable MICE imputation so more rows are retained."
            )

    try:
        Xc = sm.add_constant(numeric, has_constant="add")
        rank = int(np.linalg.matrix_rank(Xc.to_numpy(dtype=float)))
        full_rank = int(Xc.shape[1])
        if rank < full_rank:
            redundant = [c for c in _find_redundant_columns(Xc) if c != "const"]
            if redundant:
                cols = _describe_terms(redundant, schema)
                raw_codes = ", ".join(f"'{c}'" for c in redundant)
                return (
                    f"Predictors {cols} are perfectly redundant (one is an exact combination of the others), "
                    f"so the model is not identifiable. Drop one of: {cols}. Raw design terms: {raw_codes}."
                )
            cols = _describe_terms(list(numeric.columns), schema)
            raw_codes = ", ".join(f"'{c}'" for c in numeric.columns)
            return (
                f"The selected predictors are rank-deficient ({rank} independent columns for {full_rank} model terms), "
                f"so the model is not identifiable. Drop one redundant predictor from: {cols}. Raw design terms: {raw_codes}."
            )
    except Exception:
        pass

    try:
        stds = numeric.std(ddof=0).replace(0, np.nan)
        positive_stds = stds[np.isfinite(stds) & (stds > 0)]
        max_abs = numeric.abs().max()
        finite_max_abs = max_abs[np.isfinite(max_abs)]
        if len(positive_stds) > 0 and len(finite_max_abs) > 0:
            scale_ratio = float(finite_max_abs.max() / positive_stds.min())
            if scale_ratio > 1e12:
                col = str(finite_max_abs.idxmax())
                return (
                    f"Predictor '{col}' has an extreme value range compared with the other predictors. "
                    f"Check units or exclude '{col}', then re-run."
                )
    except Exception:
        pass

    return None


def _looks_like_solver_error(exc):
    text = str(exc)
    return (
        isinstance(exc, np.linalg.LinAlgError)
        or "DLASCL" in text
        or "illegal value" in text
        or "On entry to" in text
        or "Singular matrix" in text
    )


def _solver_error_message(model_label, exc):
    return (
        f"The numerical solver rejected the design matrix for {model_label}. This is usually caused by predictors "
        "that are perfectly redundant or on extremely different scales. Try removing redundant predictors or "
        f"reducing the predictor set, then re-run. (Solver detail: {exc})"
    )


def univariate_or(data_json, schema_json, outcome, predictors_json, reference_levels_json=None, setup_json=None):
    df = _dataframe(data_json)
    schema = _schema_map(schema_json)
    predictors = _loads(predictors_json)
    refs = _loads(reference_levels_json) if reference_levels_json else {}
    setup = _loads(setup_json) if setup_json else None
    rows = []
    for predictor in predictors:
        try:
            X, y, terms, _, _, _, _ = _design(df, schema, outcome, [predictor], refs, setup=setup)
            if X.empty:
                continue
            sep = _separation_from_arrays(X, y)
            use_firth = bool(sep["separated"] or sep["quasi"])
            if use_firth:
                _, coef, se, ci_df, pvals, _ = _fit_statsmodels(X, y, schema, firth=True)
                for term in terms:
                    row_ci = tuple(ci_df.loc[term]) if ci_df is not None and term in ci_df.index else None
                    se_t = float(se[term]) if se is not None and term in se.index else None
                    p_t = float(pvals[term]) if term in pvals.index and np.isfinite(pvals[term]) else None
                    row = _or_row(term, float(coef[term]), se_t, p_t, row_ci, "profile_likelihood" if row_ci is not None else "none")
                    row["method"] = "firth"
                    row["variable"] = predictor
                    row["level"] = term.split("=", 1)[1] if "=" in term else None
                    row["display_label"] = _display_term_label(term, schema, refs)
                    rows.append(row)
                continue
            fit = sm.Logit(y, sm.add_constant(X, has_constant="add")).fit(disp=False, maxiter=100)
            conf = fit.conf_int()
            for term in terms:
                row = _or_row(term, fit.params[term], fit.bse[term], fit.pvalues[term], tuple(conf.loc[term]), "wald")
                row["method"] = "plain"
                row["variable"] = predictor
                row["level"] = term.split("=", 1)[1] if "=" in term else None
                row["display_label"] = _display_term_label(term, schema, refs)
                rows.append(row)
        except ModelingInputError as exc:
            if outcome in getattr(exc, "unmatched", []) or "exactly 2 groups" in str(exc):
                return _input_error_payload(exc, df)
            rows.append({"variable": predictor, "label": predictor, "level": None, "or": None, "ci_low": None, "ci_high": None, "p": None, "note": str(exc)})
        except Exception as exc:
            rows.append({"variable": predictor, "label": predictor, "level": None, "or": None, "ci_low": None, "ci_high": None, "p": None, "note": str(exc)})
    return _dump(rows)


def _fit_statsmodels(X, y, schema=None, firth=False):
    if firth:
        diagnosis = _diagnose_design(X, y, schema)
        if diagnosis:
            raise ModelingInputError(diagnosis)
        try:
            from sklearn.base import BaseEstimator
            from sklearn.utils.validation import validate_data
            from firthlogist import FirthLogisticRegression

            if not hasattr(BaseEstimator, "_validate_data"):
                def _validate_data_compat(self, X, y=None, **kwargs):
                    return validate_data(self, X, y, **kwargs)
                BaseEstimator._validate_data = _validate_data_compat

            model = FirthLogisticRegression(max_iter=1000)
            model.fit(X.to_numpy(), y.to_numpy())
            coef = pd.Series(model.coef_, index=X.columns)
            intercept = float(model.intercept_)
            ci_attr = getattr(model, "ci_", None)
            p_attr = getattr(model, "pvals_", None)
            se_attr = getattr(model, "bse_", None)
            ci = pd.DataFrame(np.asarray(ci_attr)[:len(X.columns)], index=X.columns) if ci_attr is not None else None
            pvals = pd.Series(np.asarray(p_attr)[:len(X.columns)], index=X.columns) if p_attr is not None else pd.Series([np.nan] * len(X.columns), index=X.columns)
            se = pd.Series(np.asarray(se_attr)[:len(X.columns)], index=X.columns) if se_attr is not None else None
            return intercept, coef, se, ci, pvals, model
        except Exception as exc:
            diagnosis = _diagnose_design(X, y, schema)
            if diagnosis:
                raise ModelingInputError(diagnosis)
            if _looks_like_solver_error(exc):
                raise ModelingInputError(_solver_error_message("Firth logistic regression", exc))
            raise ModelingInputError(f"Firth logistic regression failed in this build: {exc}")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fit = sm.Logit(y, sm.add_constant(X, has_constant="add")).fit(disp=False, maxiter=200)
    return float(fit.params["const"]), fit.params.drop("const"), fit.bse.drop("const"), fit.conf_int().drop("const"), fit.pvalues.drop("const"), fit


def _raw_cv_scores(clf):
    scores = getattr(clf, "scores_", None)
    if not scores:
        return None
    first = next(iter(scores.values()))
    return np.asarray(first, dtype=float)  # (n_folds, n_Cs) or (n_folds, n_Cs, n_l1)


def _select_one_se_c(clf):
    arr = _raw_cv_scores(clf)
    cs = np.asarray(getattr(clf, "Cs_", []), dtype=float)
    if arr is None or len(cs) == 0:
        return None
    if arr.ndim == 3:
        # Slice to the l1_ratio the CV selected, then apply the 1SE rule on C
        # within that slice (never average across l1_ratios).
        l1_grid = np.asarray(getattr(clf, "l1_ratios", []) or [], dtype=float)
        sel_l1 = float(np.atleast_1d(getattr(clf, "l1_ratio_", [np.nan]))[0])
        if len(l1_grid) and np.isfinite(sel_l1):
            l1_idx = int(np.argmin(np.abs(l1_grid - sel_l1)))
        else:
            means_3d = np.nanmean(arr, axis=0)
            l1_idx = int(np.unravel_index(np.nanargmax(means_3d), means_3d.shape)[1])
        scores = arr[:, :, l1_idx]
    elif arr.ndim == 2:
        scores = arr
    else:
        return None
    if scores.shape[1] != len(cs):
        return None
    means = np.nanmean(scores, axis=0)
    best_idx = int(np.nanargmax(means))
    se = float(np.nanstd(scores[:, best_idx], ddof=1) / math.sqrt(scores.shape[0])) if scores.shape[0] > 1 else 0.0
    threshold = means[best_idx] - se
    eligible = np.where(means >= threshold)[0]
    if len(eligible) == 0:
        return float(cs[best_idx])
    return float(np.min(cs[eligible]))


def _selected_l1_ratio(clf):
    value = np.atleast_1d(getattr(clf, "l1_ratio_", []))
    return float(value[0]) if len(value) and np.isfinite(value[0]) else None


def _fit_sklearn(X, y, model_kind, seed, schema=None, fixed_c=None, inner_cv=None, lambda_rule="lambda_1se", fixed_l1_ratio=None):
    from sklearn.linear_model import LogisticRegression, LogisticRegressionCV
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    diagnosis = _diagnose_design(X, y, schema)
    if diagnosis:
        raise ModelingInputError(diagnosis)

    if fixed_c is not None and model_kind in {"ridge", "lasso", "elasticnet"}:
        kwargs = {"C": float(fixed_c), "max_iter": 2000, "random_state": seed, "n_jobs": 1}
        if model_kind == "ridge":
            estimator = LogisticRegression(penalty="l2", solver="lbfgs", **kwargs)
        elif model_kind == "lasso":
            estimator = LogisticRegression(penalty="l1", solver="saga", **kwargs)
        else:
            estimator = LogisticRegression(
                penalty="elasticnet", solver="saga",
                l1_ratio=0.5 if fixed_l1_ratio is None else float(fixed_l1_ratio),
                **kwargs,
            )
    elif model_kind == "ridge":
        estimator = LogisticRegressionCV(
            Cs=10, cv=inner_cv or min(5, max(2, int(y.sum()), int((1 - y).sum()))), penalty="l2",
            solver="lbfgs", scoring="neg_log_loss", max_iter=1000, random_state=seed, n_jobs=1
        )
    elif model_kind == "lasso":
        estimator = LogisticRegressionCV(
            Cs=10, cv=inner_cv or min(5, max(2, int(y.sum()), int((1 - y).sum()))), penalty="l1",
            solver="saga", scoring="neg_log_loss", max_iter=2000, random_state=seed, n_jobs=1
        )
    elif model_kind == "elasticnet":
        estimator = LogisticRegressionCV(
            Cs=10, cv=inner_cv or min(5, max(2, int(y.sum()), int((1 - y).sum()))), penalty="elasticnet",
            solver="saga", l1_ratios=[0.25, 0.5, 0.75], scoring="neg_log_loss",
            max_iter=2000, random_state=seed, n_jobs=1
        )
    else:
        estimator = LogisticRegression(penalty=None, solver="lbfgs", max_iter=1000, random_state=seed, n_jobs=1)
    pipe = Pipeline([("scale", StandardScaler()), ("model", estimator)])
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            pipe.fit(X, y)
    except Exception as exc:
        diagnosis = _diagnose_design(X, y, schema)
        if diagnosis:
            raise ModelingInputError(diagnosis)
        if _looks_like_solver_error(exc):
            raise ModelingInputError(_solver_error_message(f"{model_kind} logistic regression", exc))
        raise
    if fixed_c is None and model_kind in {"ridge", "lasso", "elasticnet"} and lambda_rule == "lambda_1se":
        selected_c = _select_one_se_c(pipe.named_steps["model"])
        if selected_c is not None:
            selected_l1 = _selected_l1_ratio(pipe.named_steps["model"]) if model_kind == "elasticnet" else None
            return _fit_sklearn(X, y, model_kind, seed, schema=schema, fixed_c=selected_c,
                                inner_cv=inner_cv, lambda_rule="lambda_fixed_1se",
                                fixed_l1_ratio=selected_l1)
    clf = pipe.named_steps["model"]
    scaler = pipe.named_steps["scale"]
    scale = np.asarray(getattr(scaler, "scale_", np.ones(len(X.columns))), dtype=float)
    mean = np.asarray(getattr(scaler, "mean_", np.zeros(len(X.columns))), dtype=float)
    scale = np.where(scale == 0, 1.0, scale)
    raw_coef = np.asarray(clf.coef_[0], dtype=float)
    unscaled_coef = raw_coef / scale
    coef = pd.Series(unscaled_coef, index=X.columns)
    intercept = float(clf.intercept_[0] - np.sum(raw_coef * mean / scale))
    c_value = float(clf.C_[0]) if hasattr(clf, "C_") else None
    applied = "lambda_1se" if lambda_rule == "lambda_fixed_1se" else ("fixed_lambda" if fixed_c is not None else ("lambda_min" if lambda_rule == "lambda_min" else "lambda_1se"))
    return intercept, coef, c_value, pipe, applied


def _can_mice():
    try:
        from sklearn.experimental import enable_iterative_imputer  # noqa: F401
        from sklearn.impute import IterativeImputer  # noqa: F401
        return True
    except Exception:
        return False


def _impute_frame(df, schema, setup, seed):
    try:
        from sklearn.experimental import enable_iterative_imputer  # noqa: F401
        from sklearn.impute import IterativeImputer
    except Exception as exc:
        raise ModelingInputError("MICE could not run in this build; switch to complete-case or retry.") from exc

    outcome = setup["outcome"]
    predictors = setup.get("predictors", [])
    include_outcome = bool(setup.get("imputation", {}).get("includeOutcome", True))
    requested = [outcome] + predictors
    resolved, unmatched = _resolve_columns(df, requested)
    if not resolved or resolved[0] is None:
        raise ModelingInputError(
            f"Outcome column '{outcome}' was not found in the data.",
            unmatched=[outcome],
            available=list(df.columns)[:50],
        )
    predictor_pairs = [(req, actual) for req, actual in zip(requested[1:], resolved[1:]) if actual is not None]
    work = df[[resolved[0]] + [actual for _, actual in predictor_pairs]].copy()
    work.columns = [outcome] + [req for req, _ in predictor_pairs]
    work = work.dropna(subset=[outcome])
    if len(work) == 0:
        raise ModelingInputError("No rows remain after removing missing outcomes for MICE imputation.", unmatched=unmatched, available=list(df.columns)[:50])

    numeric_cols = []
    for name, _ in predictor_pairs:
        col = schema.get(name, {})
        if col.get("confirmedType") not in CATEGORICAL_TYPES:
            work[name] = pd.to_numeric(work[name], errors="coerce")
            numeric_cols.append(name)
    if numeric_cols:
        all_missing = [name for name in numeric_cols if work[name].notna().sum() == 0]
        if all_missing:
            raise ModelingInputError(f"MICE could not run because these numeric predictors are entirely missing: {', '.join(all_missing)}.", unmatched=unmatched, available=list(df.columns)[:50])
        imputer = IterativeImputer(sample_posterior=True, random_state=int(seed), max_iter=10, skip_complete=True)
        impute_input = work[numeric_cols].copy()
        if include_outcome:
            outcome_codes, _ = pd.factorize(work[outcome])
            impute_input["__outcome_helper__"] = outcome_codes.astype(float)
        imputed = imputer.fit_transform(impute_input)
        work[numeric_cols] = imputed[:, :len(numeric_cols)]

    for name, _ in predictor_pairs:
        col = schema.get(name, {})
        if col.get("confirmedType") in CATEGORICAL_TYPES and work[name].isna().any():
            mode = work[name].dropna().mode()
            fill = mode.iloc[0] if len(mode) else ""
            work[name] = work[name].fillna(fill)
    return work, [name for name in unmatched if name != outcome]


def _simple_impute_frame(df, schema, setup, policy):
    try:
        from sklearn.impute import SimpleImputer
    except Exception as exc:
        raise ModelingInputError("Simple imputation could not run in this build; switch to complete-case or retry.") from exc

    outcome = setup["outcome"]
    predictors = setup.get("predictors", [])
    requested = [outcome] + predictors
    resolved, unmatched = _resolve_columns(df, requested)
    if not resolved or resolved[0] is None:
        raise ModelingInputError(
            f"Outcome column '{outcome}' was not found in the data.",
            unmatched=[outcome],
            available=list(df.columns)[:50],
        )
    predictor_pairs = [(req, actual) for req, actual in zip(requested[1:], resolved[1:]) if actual is not None]
    work = df[[resolved[0]] + [actual for _, actual in predictor_pairs]].copy()
    work.columns = [outcome] + [req for req, _ in predictor_pairs]
    work = work.dropna(subset=[outcome])
    if len(work) == 0:
        raise ModelingInputError("No rows remain after removing missing outcomes for simple imputation.", unmatched=unmatched, available=list(df.columns)[:50])

    numeric_cols = []
    for name, _ in predictor_pairs:
        col = schema.get(name, {})
        if col.get("confirmedType") not in CATEGORICAL_TYPES:
            work[name] = pd.to_numeric(work[name], errors="coerce")
            numeric_cols.append(name)
    if numeric_cols:
        all_missing = [name for name in numeric_cols if work[name].notna().sum() == 0]
        if all_missing:
            raise ModelingInputError(f"Simple imputation could not run because these numeric predictors are entirely missing: {', '.join(all_missing)}.", unmatched=unmatched, available=list(df.columns)[:50])
        strategy = {"mean": "mean", "median": "median", "mode": "most_frequent", "constant": "constant"}[policy]
        kwargs = {"strategy": strategy}
        if policy == "constant":
            kwargs["fill_value"] = float(setup.get("imputation", {}).get("constantNumeric", 0))
        imputer = SimpleImputer(**kwargs)
        work[numeric_cols] = imputer.fit_transform(work[numeric_cols])

    for name, _ in predictor_pairs:
        col = schema.get(name, {})
        if col.get("confirmedType") in CATEGORICAL_TYPES and work[name].isna().any():
            if policy == "constant":
                fill = setup.get("imputation", {}).get("constantLabel", "Missing")
            else:
                mode = work[name].dropna().mode()
                fill = mode.iloc[0] if len(mode) else ""
            work[name] = work[name].fillna(fill)
    return work, [name for name in unmatched if name != outcome]


def _ml_impute_frame(df, schema, setup, policy, seed):
    try:
        if policy == "knn":
            from sklearn.impute import KNNImputer
        else:
            from sklearn.experimental import enable_iterative_imputer  # noqa: F401
            from sklearn.ensemble import RandomForestRegressor
            from sklearn.impute import IterativeImputer
    except Exception as exc:
        label = "kNN" if policy == "knn" else "Random-forest"
        raise ModelingInputError(f"{label} imputation could not run in this build; switch to complete-case or retry.") from exc

    outcome = setup["outcome"]
    predictors = setup.get("predictors", [])
    include_outcome = bool(setup.get("imputation", {}).get("includeOutcome", False))
    requested = [outcome] + predictors
    resolved, unmatched = _resolve_columns(df, requested)
    if not resolved or resolved[0] is None:
        raise ModelingInputError(
            f"Outcome column '{outcome}' was not found in the data.",
            unmatched=[outcome],
            available=list(df.columns)[:50],
        )
    predictor_pairs = [(req, actual) for req, actual in zip(requested[1:], resolved[1:]) if actual is not None]
    work = df[[resolved[0]] + [actual for _, actual in predictor_pairs]].copy()
    work.columns = [outcome] + [req for req, _ in predictor_pairs]
    work = work.dropna(subset=[outcome])
    if len(work) == 0:
        raise ModelingInputError(f"No rows remain after removing missing outcomes for {policy} imputation.", unmatched=unmatched, available=list(df.columns)[:50])

    numeric_cols = []
    for name, _ in predictor_pairs:
        col = schema.get(name, {})
        if col.get("confirmedType") not in CATEGORICAL_TYPES:
            work[name] = pd.to_numeric(work[name], errors="coerce")
            numeric_cols.append(name)
    if numeric_cols:
        all_missing = [name for name in numeric_cols if work[name].notna().sum() == 0]
        if all_missing:
            label = "kNN" if policy == "knn" else "Random-forest"
            raise ModelingInputError(f"{label} imputation could not run because these numeric predictors are entirely missing: {', '.join(all_missing)}.", unmatched=unmatched, available=list(df.columns)[:50])
        if policy == "knn":
            requested_k = int(setup.get("imputation", {}).get("knnNeighbors", 5) or 5)
            impute_input = work[numeric_cols].copy()
            if include_outcome:
                outcome_codes, _ = pd.factorize(work[outcome])
                impute_input["__outcome_helper__"] = outcome_codes.astype(float)
            imputed = _knn_impute_scaled(
                impute_input,
                None,
                list(impute_input.columns),
                min(max(1, requested_k), max(1, len(work) - 1)),
            )[0]
            work[numeric_cols] = imputed[numeric_cols].to_numpy()
            impute_input = None
        else:
            estimator = RandomForestRegressor(
                n_estimators=100,
                max_depth=None,
                min_samples_leaf=1,
                random_state=int(seed),
                n_jobs=1,
            )
            imputer = IterativeImputer(
                estimator=estimator,
                random_state=int(seed),
                max_iter=5,
                initial_strategy="median",
                skip_complete=True,
            )
            impute_input = work[numeric_cols].copy()
            if include_outcome:
                outcome_codes, _ = pd.factorize(work[outcome])
                impute_input["__outcome_helper__"] = outcome_codes.astype(float)
            imputed = imputer.fit_transform(impute_input)
            work[numeric_cols] = imputed[:, :len(numeric_cols)]

    for name, _ in predictor_pairs:
        col = schema.get(name, {})
        if col.get("confirmedType") in CATEGORICAL_TYPES and work[name].isna().any():
            mode = work[name].dropna().mode()
            fill = mode.iloc[0] if len(mode) else ""
            work[name] = work[name].fillna(fill)
    return work, [name for name in unmatched if name != outcome]


def _knn_impute_scaled(train, test, continuous_cols, n_neighbors):
    from sklearn.impute import KNNImputer
    from sklearn.preprocessing import StandardScaler

    train_scaled = train.copy().astype(float)
    test_scaled = test.copy().astype(float) if test is not None else None
    continuous_cols = [col for col in continuous_cols if col in train_scaled.columns]
    scaler = None
    if continuous_cols:
        scaler = StandardScaler()
        train_scaled.loc[:, continuous_cols] = scaler.fit_transform(train_scaled[continuous_cols])
        if test_scaled is not None:
            test_scaled.loc[:, continuous_cols] = scaler.transform(test_scaled[continuous_cols])
    imputer = KNNImputer(n_neighbors=n_neighbors)
    train_imputed = pd.DataFrame(imputer.fit_transform(train_scaled), index=train.index, columns=train.columns)
    test_imputed = None
    if test_scaled is not None:
        test_imputed = pd.DataFrame(imputer.transform(test_scaled), index=test.index, columns=test.columns)
    if scaler is not None and continuous_cols:
        train_imputed.loc[:, continuous_cols] = scaler.inverse_transform(train_imputed[continuous_cols])
        if test_imputed is not None:
            test_imputed.loc[:, continuous_cols] = scaler.inverse_transform(test_imputed[continuous_cols])
    return train_imputed, test_imputed


def _modeling_work_frame(df, schema, setup):
    outcome = setup["outcome"]
    predictors = setup.get("predictors", [])
    requested = [outcome] + predictors
    resolved, unmatched = _resolve_columns(df, requested)
    if not resolved or resolved[0] is None:
        raise ModelingInputError(
            f"Outcome column '{outcome}' was not found in the data.",
            unmatched=[outcome],
            available=list(df.columns)[:50],
        )
    predictor_pairs = [(req, actual) for req, actual in zip(requested[1:], resolved[1:]) if actual is not None]
    work = df[[resolved[0]] + [actual for _, actual in predictor_pairs]].copy()
    work.columns = [outcome] + [req for req, _ in predictor_pairs]
    work = work.dropna(subset=[outcome])
    if len(work) == 0:
        raise ModelingInputError("No rows remain after removing missing outcomes.", unmatched=unmatched, available=list(df.columns)[:50])
    return work, [name for name in unmatched if name != outcome]


def _ml_level_sets(work_df, schema, predictors, reference_levels):
    level_sets = {}
    effective_refs = {}
    warnings_out = []
    for name in predictors:
        col = schema.get(name, {})
        if col.get("confirmedType") not in CATEGORICAL_TYPES or name not in work_df.columns:
            continue
        series = work_df[name].astype("object")
        levels = list(pd.unique(series.dropna()))
        ref = reference_levels.get(name, col.get("referenceLevel", levels[0] if levels else None))
        if ref is not None and levels and not any(str(lvl) == str(ref) for lvl in levels):
            counts = series.dropna().value_counts()
            ref = counts.index[0] if len(counts) else levels[0]
            warnings_out.append(f"Reference level for '{name}' had no outcome-observed rows; using '{ref}' as reference.")
        effective_refs[name] = ref
        level_sets[name] = [lvl for lvl in levels if str(lvl) != str(ref)]
    return level_sets, effective_refs, warnings_out


def _fold_local_design(train_work, test_work, schema, outcome, predictors, refs, level_sets):
    train_parts = []
    test_parts = []
    terms = []
    for name in predictors:
        if name not in train_work.columns or name not in test_work.columns:
            continue
        col = schema.get(name, {})
        if col.get("confirmedType") in CATEGORICAL_TYPES:
            train_series = train_work[name].astype("object")
            test_series = test_work[name].astype("object")
            mode = train_series.dropna().mode()
            fill = mode.iloc[0] if len(mode) else refs.get(name, "")
            train_series = train_series.fillna(fill)
            test_series = test_series.fillna(fill)
            for lvl in level_sets.get(name, []):
                term = f"{name}={lvl}"
                train_parts.append((train_series.astype(str) == str(lvl)).astype(float).rename(term))
                test_parts.append((test_series.astype(str) == str(lvl)).astype(float).rename(term))
                terms.append(term)
        else:
            train_parts.append(pd.to_numeric(train_work[name], errors="coerce").astype(float).rename(name))
            test_parts.append(pd.to_numeric(test_work[name], errors="coerce").astype(float).rename(name))
            terms.append(name)
    X_train = pd.concat(train_parts, axis=1).astype(float) if train_parts else pd.DataFrame(index=train_work.index)
    X_test = pd.concat(test_parts, axis=1).astype(float) if test_parts else pd.DataFrame(index=test_work.index)
    return X_train, X_test, terms


def _fit_fold_imputer(X_train, X_test, setup, policy, seed):
    try:
        if policy in SIMPLE_POLICIES:
            from sklearn.impute import SimpleImputer
        elif policy == "knn":
            from sklearn.impute import KNNImputer
        elif policy in {"rf", "mice"}:
            from sklearn.experimental import enable_iterative_imputer  # noqa: F401
            from sklearn.impute import IterativeImputer
            if policy == "rf":
                from sklearn.ensemble import RandomForestRegressor
    except Exception as exc:
        raise ModelingInputError(f"{policy} imputation could not run in this build; switch to complete-case or retry.") from exc

    train = X_train.copy()
    test = X_test.copy()
    all_missing = [name for name in train.columns if train[name].notna().sum() == 0]
    if all_missing:
        raise ModelingInputError(f"{policy} imputation could not run inside CV because these design columns are entirely missing in a training fold: {', '.join(all_missing)}.")
    if policy in SIMPLE_POLICIES:
        strategy = {"mean": "mean", "median": "median", "mode": "most_frequent", "constant": "constant"}[policy]
        kwargs = {"strategy": strategy}
        if policy == "constant":
            kwargs["fill_value"] = float(setup.get("imputation", {}).get("constantNumeric", 0))
        imputer = SimpleImputer(**kwargs)
        train.loc[:, :] = imputer.fit_transform(train)
        test.loc[:, :] = imputer.transform(test)
    elif policy == "knn":
        requested_k = int(setup.get("imputation", {}).get("knnNeighbors", 5) or 5)
        continuous_cols = [name for name in train.columns if "=" not in str(name)]
        train, test = _knn_impute_scaled(train, test, continuous_cols, min(max(1, requested_k), max(1, len(train) - 1)))
    elif policy == "rf":
        estimator = RandomForestRegressor(
            n_estimators=100,
            max_depth=None,
            min_samples_leaf=1,
            random_state=int(seed),
            n_jobs=1,
        )
        imputer = IterativeImputer(
            estimator=estimator,
            random_state=int(seed),
            max_iter=5,
            initial_strategy="median",
            skip_complete=True,
        )
        train.loc[:, :] = imputer.fit_transform(train)
        test.loc[:, :] = imputer.transform(test)
    else:
        imputer = IterativeImputer(sample_posterior=False, random_state=int(seed), max_iter=10, skip_complete=True)
        train.loc[:, :] = imputer.fit_transform(train)
        test.loc[:, :] = imputer.transform(test)
    return train, test


def _pool_rubin(coefs, ses, m=None):
    from scipy import stats

    coef_df = coefs if isinstance(coefs, pd.DataFrame) else pd.DataFrame(coefs)
    se_df = ses if isinstance(ses, pd.DataFrame) else pd.DataFrame(ses)
    m = int(m or len(coef_df))
    qbar = coef_df.mean(axis=0)
    ubar = (se_df ** 2).mean(axis=0)
    b = coef_df.var(axis=0, ddof=1).fillna(0.0)
    total = ubar + (1 + 1 / m) * b
    pooled_se = np.sqrt(total)
    multiplier = (1 + 1 / m) * b
    df = pd.Series(np.inf, index=qbar.index, dtype=float)
    positive_b = multiplier > 0
    df.loc[positive_b] = (m - 1) * (1 + (ubar.loc[positive_b] / multiplier.loc[positive_b])) ** 2
    t_stat = qbar / pooled_se
    pvals = pd.Series(index=qbar.index, dtype=float)
    ci_low = pd.Series(index=qbar.index, dtype=float)
    ci_high = pd.Series(index=qbar.index, dtype=float)
    for term in qbar.index:
        se_value = float(pooled_se[term])
        if not np.isfinite(se_value) or se_value <= 0:
            pvals[term] = np.nan
            ci_low[term] = np.nan
            ci_high[term] = np.nan
            continue
        df_value = float(df[term])
        crit = stats.norm.ppf(0.975) if np.isinf(df_value) else stats.t.ppf(0.975, df_value)
        pvals[term] = 2 * (stats.norm.sf(abs(float(t_stat[term]))) if np.isinf(df_value) else stats.t.sf(abs(float(t_stat[term])), df_value))
        ci_low[term] = float(qbar[term]) - crit * se_value
        ci_high[term] = float(qbar[term]) + crit * se_value
    return {
        "coef": qbar,
        "se": pooled_se,
        "ci": pd.DataFrame({"low": ci_low, "high": ci_high}),
        "pvals": pvals,
        "df": df,
        "total_variance": total,
    }


def _fit_once(df, schema, setup, seed=None, force_complete=False, fixed_c=None, inner_cv=None, resolved_model=None):
    outcome = setup["outcome"]
    predictors = setup.get("predictors", [])
    model_kind = setup.get("model", "ridge")
    refs = setup.get("referenceLevels", {})
    seed = int(setup.get("seed", 20260229) if seed is None else seed)
    imputation = setup.get("imputation", {}).get("policy", "complete_case")
    imputation_method = "complete_case"
    extra_unmatched = []
    fit_df = df
    if imputation in SIMPLE_POLICIES and not force_complete:
        fit_df, extra_unmatched = _simple_impute_frame(df, schema, setup, imputation)
        imputation_method = f"simple_{imputation}_numeric_mode_categorical"
    elif imputation in ML_IMPUTER_POLICIES and not force_complete:
        fit_df, extra_unmatched = _ml_impute_frame(df, schema, setup, imputation, seed)
        imputation_method = f"{imputation}_numeric_mode_categorical"
    elif imputation == "mice" and not force_complete:
        fit_df, extra_unmatched = _impute_frame(df, schema, setup, seed)
        imputation_method = f"mice_iterativeimputer_numeric_mode_categorical_m{int(setup.get('imputation', {}).get('m', 20))}"
    X, y, terms, sources, y_mapping, unmatched, design_warnings = _design(fit_df, schema, outcome, predictors, refs, setup=setup)
    outcome_schema = schema.get(outcome, {})
    unmatched = sorted(set(unmatched + extra_unmatched))
    sep = _separation_from_arrays(X, y)
    if resolved_model is not None:
        model_kind = resolved_model
    elif model_kind == "plain" and (sep["separated"] or sep["quasi"]):
        model_kind = "firth"
    if X.empty:
        raise ValueError("At least one predictor is required.")

    pvals = pd.Series([np.nan] * len(X.columns), index=X.columns)
    ci = None
    se = None
    c_value = None
    lambda_rule_applied = None
    method_fallback = False
    if model_kind in {"plain", "firth"}:
        if model_kind == "plain":
            try:
                intercept, coef, se, ci, pvals, fitted = _fit_statsmodels(X, y, schema=schema, firth=False)
                converged = bool(getattr(fitted, "mle_retvals", {}).get("converged", True))
                if not converged:
                    raise RuntimeError("Plain logistic regression did not converge.")
            except Exception:
                intercept, coef, se, ci, pvals, fitted = _fit_statsmodels(X, y, schema=schema, firth=True)
                model_kind = "firth"
                method_fallback = True
        else:
            intercept, coef, se, ci, pvals, fitted = _fit_statsmodels(X, y, schema=schema, firth=True)
        selected = list(coef.index)
    else:
        lambda_rule = setup.get("lambdaRule", "lambda_1se")
        intercept, coef, c_value, fitted, lambda_rule_applied = _fit_sklearn(X, y, model_kind, seed, schema=schema, fixed_c=fixed_c, inner_cv=inner_cv, lambda_rule=lambda_rule)
        if model_kind == "ridge":
            selected = list(coef.index)
        else:
            selected = list(coef[coef.abs() > 1e-8].index)
            if not selected and len(coef):
                selected = [coef.abs().sort_values(ascending=False).index[0]]
            selected_sources = {sources[terms.index(t)] for t in selected if t in terms}
            selected = [t for t, src in zip(terms, sources) if src in selected_sources]
            coef = coef.reindex(selected).fillna(0.0)
    logits = intercept + X.reindex(columns=list(coef.index), fill_value=0.0).dot(coef)
    probs = 1 / (1 + np.exp(-np.clip(logits, -35, 35)))
    return {
        "X": X,
        "y": y,
        "terms": terms,
        "sources": sources,
        "model": model_kind,
        "intercept": intercept,
        "coef": coef,
        "se": se,
        "ci": ci,
        "pvals": pvals,
        "probs": probs,
        "selected": selected,
        "method_fallback": method_fallback,
        "lambda": None if c_value is None else 1.0 / c_value,
        "lambda_rule_applied": lambda_rule_applied,
        "c_value": c_value,
        "unmatched": unmatched,
        "imputation_method": imputation_method,
        "diagnostics": {
            "separated": sep["separated"],
            "quasi": sep["quasi"],
            "convergence_warning": sep.get("convergence_warning", False),
            "culprits": sep.get("culprits", []),
            "detection": sep.get("detection"),
            "n": int(len(y)),
            "p": int(X.shape[1]),
            "unmatched_predictors": unmatched,
            "warnings": design_warnings,
            "firth_fallback_count": 1 if method_fallback else 0,
            "outcome_mapping": {str(k): int(v) for k, v in y_mapping.items()},
            "outcome_event_level": _resolve_outcome_level(
                next((str(k) for k, v in y_mapping.items() if int(v) == 1), None),
                outcome_schema,
            ),
            "outcome_reference_level": _resolve_outcome_level(
                next((str(k) for k, v in y_mapping.items() if int(v) == 0), None),
                outcome_schema,
            ),
        },
}


def _mice_voted_penalized_selection(fits, terms, sources, m):
    threshold = int(math.ceil(m / 2))
    source_counts = {src: 0 for src in dict.fromkeys(sources)}
    for fit in fits:
        fit_selected_sources = {sources[terms.index(term)] for term in fit.get("selected", []) if term in terms}
        for src in fit_selected_sources:
            source_counts[src] = source_counts.get(src, 0) + 1
    kept_sources = {src for src, count in source_counts.items() if count >= threshold}
    if not kept_sources and source_counts:
        best_count = max(source_counts.values())
        kept_sources = {next(src for src in dict.fromkeys(sources) if source_counts.get(src, 0) == best_count)}
    return [term for term, src in zip(terms, sources) if src in kept_sources]


def _fit_point(df, schema, setup):
    if setup.get("imputation", {}).get("policy", "complete_case") != "mice":
        return _fit_once(df, schema, setup)
    if not _can_mice():
        raise ModelingInputError("MICE could not run in this build; switch to complete-case or retry.")
    m = max(1, int(setup.get("imputation", {}).get("m", 20)))
    seed = int(setup.get("seed", 20260229))
    fits = [_fit_once(df, schema, setup, seed=seed, force_complete=False)]
    base = fits[0]
    for i in range(1, m):
        fits.append(_fit_once(df, schema, setup, seed=seed + i, force_complete=False, resolved_model=base["model"]))
    all_terms = list(dict.fromkeys(term for fit in fits for term in fit["coef"].index))
    coef_mat = np.vstack([fit["coef"].reindex(all_terms).fillna(0.0).to_numpy() for fit in fits])
    mean_coef = pd.Series(np.mean(coef_mat, axis=0), index=all_terms)
    base["coef"] = mean_coef
    base["intercept"] = float(np.mean([fit["intercept"] for fit in fits]))
    if base["model"] in {"lasso", "elasticnet"}:
        voted_selected = _mice_voted_penalized_selection(fits, base["terms"], base["sources"], m)
        base["selected"] = voted_selected
        base["coef"] = mean_coef.reindex(voted_selected).fillna(0.0)
    else:
        base["selected"] = all_terms
    base["imputation_method"] = f"mice_iterativeimputer_numeric_mode_categorical_m{m}"
    base["diagnostics"]["firth_fallback_count"] = int(sum(1 for fit in fits if fit.get("method_fallback")))
    base["lambda"] = float(np.mean([fit["lambda"] for fit in fits if fit["lambda"] is not None])) if any(fit["lambda"] is not None for fit in fits) else None
    base["c_value"] = None if base["lambda"] is None else 1.0 / base["lambda"]
    base["lambda_rule_applied"] = setup.get("lambdaRule", "lambda_1se") if base["lambda"] is not None else None
    if base["model"] in {"plain", "firth"} and all(fit["se"] is not None for fit in fits):
        se_mat = pd.DataFrame([fit["se"].reindex(all_terms).to_numpy() for fit in fits], columns=all_terms)
        pooled = _pool_rubin(pd.DataFrame(coef_mat, columns=all_terms), se_mat, m)
        base["se"] = pooled["se"]
        base["ci"] = pooled["ci"]
        base["pvals"] = pooled["pvals"]
        base["ci_method"] = "rubin"
    else:
        # Penalized-model Wald SEs are not valid to pool; bootstrap-then-impute remains the CI path.
        base["se"] = None
        base["ci"] = None
        base["pvals"] = pd.Series([np.nan] * len(base["coef"]), index=base["coef"].index)
        base["ci_method"] = None
    logits = base["intercept"] + base["X"].reindex(columns=list(base["coef"].index), fill_value=0.0).dot(base["coef"])
    base["probs"] = 1 / (1 + np.exp(-np.clip(logits, -35, 35)))
    return base


def _metrics(y, probs):
    from sklearn.metrics import brier_score_loss, f1_score, matthews_corrcoef, roc_auc_score, roc_curve

    y = pd.Series(y).astype(int)
    probs = pd.Series(np.clip(probs, EPS, 1 - EPS), index=y.index).astype(float)
    auc = float(roc_auc_score(y, probs)) if y.nunique() == 2 else None
    fpr, tpr, thresholds = roc_curve(y, probs) if y.nunique() == 2 else ([], [], [])
    brier = float(brier_score_loss(y, probs))
    predicted = (probs >= CLASSIFICATION_THRESHOLD).astype(int)
    mcc = float(matthews_corrcoef(y, predicted))
    f1 = float(f1_score(y, predicted, zero_division=0))
    try:
        logits = np.log(probs / (1 - probs))
        cal = sm.Logit(y, sm.add_constant(pd.Series(logits, name="logit_p"))).fit(disp=False)
        cal_intercept = float(cal.params["const"])
        cal_slope = float(cal.params["logit_p"])
    except Exception:
        cal_intercept = None
        cal_slope = None
    curve = []
    try:
        bins = pd.qcut(pd.Series(probs), q=min(5, len(np.unique(probs))), duplicates="drop")
        grouped = pd.DataFrame({"p": probs, "y": y, "bin": bins}).groupby("bin", observed=False)
        for _, g in grouped:
            curve.append({"predicted": float(g["p"].mean()), "observed": float(g["y"].mean()), "n": int(len(g))})
    except Exception:
        curve = [{"predicted": float(probs.mean()), "observed": float(y.mean()), "n": int(len(y))}]
    return {
        "auc": auc,
        "calibration_slope": cal_slope,
        "calibration_intercept": cal_intercept,
        "brier": brier,
        "mcc": mcc,
        "f1": f1,
        "roc_curve": [{"fpr": float(a), "tpr": float(b), "threshold": None if not np.isfinite(c) else float(c)} for a, b, c in zip(fpr, tpr, thresholds)],
        "calibration_curve": curve,
    }


def _decision_curve(y_true, p_hat, grid=None, basis="apparent"):
    y = pd.Series(y_true).astype(int)
    probs = pd.Series(p_hat).astype(float)
    if grid is None:
        grid = np.round(np.linspace(0.01, 0.99, 99), 2)
    n = int(len(y))
    prevalence = float(y.mean()) if n else 0.0
    points = []
    for threshold in grid:
        pt = float(threshold)
        if pt >= 1:
            weight = None
        else:
            weight = pt / (1 - pt)
        if n == 0 or weight is None or not np.isfinite(weight):
            net_benefit = None
            net_benefit_all = None
        else:
            pred = probs >= pt
            tp = int(((y == 1) & pred).sum())
            fp = int(((y == 0) & pred).sum())
            net_benefit = float((tp / n) - (fp / n) * weight)
            net_benefit_all = float(prevalence - (1 - prevalence) * weight)
        points.append({
            "threshold": pt,
            "net_benefit": net_benefit,
            "net_benefit_treat_all": net_benefit_all,
        })
    return {"basis": basis, "prevalence": prevalence, "points": points}


def _subgroup_performance_for_values(y_true, p_hat, subgroup_values, variable, basis, min_events=5):
    y = pd.Series(y_true).astype(int).reset_index(drop=True)
    probs = pd.Series(p_hat).astype(float).reset_index(drop=True)
    groups = pd.Series(subgroup_values).astype("object").reset_index(drop=True)
    frame = pd.DataFrame({"y": y, "p": probs, "group": groups}).dropna(subset=["group"])
    levels = []
    for level in sorted(pd.unique(frame["group"]), key=lambda value: str(value)):
        subset = frame[frame["group"].astype(str) == str(level)]
        n = int(len(subset))
        events = int(subset["y"].sum())
        nonevents = int(n - events)
        if events < min_events or nonevents < min_events:
            levels.append({
                "level": str(level),
                "n": n,
                "events": events,
                "auc": None,
                "calibration_slope": None,
                "calibration_intercept": None,
                "brier": None,
                "reason": "insufficient_events",
            })
            continue
        metrics = _metrics(subset["y"], subset["p"])
        levels.append({
            "level": str(level),
            "n": n,
            "events": events,
            "auc": metrics.get("auc"),
            "calibration_slope": metrics.get("calibration_slope"),
            "calibration_intercept": metrics.get("calibration_intercept"),
            "brier": metrics.get("brier"),
        })
    return {"variable": variable, "basis": basis, "levels": levels}


def _subgroup_values_from_df(df, schema, setup, indices):
    subgroup_vars = [name for name in setup.get("subgroupVars", []) if name != setup.get("outcome")]
    if not subgroup_vars:
        return {}
    resolved, _ = _resolve_columns(df, subgroup_vars)
    values = {}
    for requested, actual in zip(subgroup_vars, resolved):
        col_schema = schema.get(requested, {})
        if actual is None or col_schema.get("confirmedType") not in CATEGORICAL_TYPES:
            continue
        values[requested] = df.loc[indices, actual].astype("object").tolist()
    return values


def _subgroup_performance_from_df(df, schema, setup, y_true, p_hat, indices, basis):
    min_events = int(setup.get("subgroupMinEvents", 5) or 5)
    by_var = _subgroup_values_from_df(df, schema, setup, indices)
    return [
        _subgroup_performance_for_values(y_true, p_hat, values, variable, basis, min_events=min_events)
        for variable, values in by_var.items()
    ]


def _stratified_bootstrap_df(df, y_series, seed):
    rng = np.random.default_rng(int(seed))
    indices = np.asarray(y_series.index)
    sampled = []
    for cls in sorted(pd.unique(y_series)):
        cls_indices = indices[np.asarray(y_series == cls)]
        if len(cls_indices) == 0:
            continue
        sampled.extend(rng.choice(cls_indices, size=len(cls_indices), replace=True).tolist())
    rng.shuffle(sampled)
    return df.loc[sampled].reset_index(drop=True), set(sampled)


def _bootstrap_engine(df, schema, setup, point, b_count):
    b_count = int(b_count or 0)
    y = point["y"]
    events = int(min(y.sum(), len(y) - y.sum()))
    if b_count <= 0 or events < 2:
        return {"method": "apparent_only", "b_effective": 0, "firth_fallback_count": 0, "coef_samples": {}, "selection_frequency": {}, "optimism": {}}
    seed = int(setup.get("seed", 20260229))
    fast_mode = bool(setup.get("fastMode", True))
    fixed_c = point.get("c_value") if fast_mode and point["model"] in {"ridge", "lasso", "elasticnet"} else None
    inner_cv = 2 if fast_mode else None
    metric_keys = ["auc", "calibration_slope", "calibration_intercept", "brier", "mcc", "f1"]
    apparent_metrics = _metrics(point["y"], point["probs"]) if "probs" in point else {}
    apparent_diffs = {key: [] for key in metric_keys}
    corrected_samples = {key: [] for key in metric_keys}
    oob_samples = {key: [] for key in metric_keys}
    coef_samples = {term: [] for term in point["coef"].index}
    selected_counts = {term: 0 for term in point["coef"].index}
    b_effective = 0
    firth_fallback_count = 0
    for b in range(b_count):
        try:
            sample_df, in_bag = _stratified_bootstrap_df(df, y, seed + 1000 + b)
            boot = _fit_once(sample_df, schema, setup, seed=seed + 2000 + b, fixed_c=fixed_c, inner_cv=inner_cv, resolved_model=point["model"])
            if boot["y"].nunique() != 2:
                continue
            if boot.get("method_fallback"):
                firth_fallback_count += 1
            boot_metrics = _metrics(boot["y"], boot["probs"])
            original_probs = 1 / (1 + np.exp(-np.clip(boot["intercept"] + point["X"].reindex(columns=list(boot["coef"].index), fill_value=0.0).dot(boot["coef"]), -35, 35)))
            test_metrics = _metrics(point["y"], original_probs)
            for key in metric_keys:
                left = boot_metrics.get(key)
                right = test_metrics.get(key)
                if left is not None and right is not None and np.isfinite(left) and np.isfinite(right):
                    diff = float(left - right)
                    apparent_diffs[key].append(diff)
                    apparent_value = apparent_metrics.get(key)
                    if apparent_value is not None and np.isfinite(apparent_value):
                        corrected_samples[key].append(float(apparent_value - diff))
            oob_idx = [ix for ix in point["y"].index if ix not in in_bag]
            if len(oob_idx) >= 2:
                y_oob = point["y"].loc[oob_idx]
                if y_oob.nunique() == 2:
                    oob_probs = 1 / (1 + np.exp(-np.clip(
                        boot["intercept"] + point["X"].loc[oob_idx].reindex(
                            columns=list(boot["coef"].index), fill_value=0.0).dot(boot["coef"]),
                        -35, 35)))
                    oob_metrics = _metrics(y_oob, oob_probs)
                    for key in metric_keys:
                        v = oob_metrics.get(key)
                        if v is not None and np.isfinite(v):
                            oob_samples[key].append(float(v))
            selected = set(boot["selected"])
            for term in point["coef"].index:
                coef_samples[term].append(float(boot["coef"].get(term, 0.0)))
                if term in selected:
                    selected_counts[term] += 1
            b_effective += 1
        except Exception:
            continue
    if b_effective < max(10, min(25, b_count // 4)):
        return {"method": "apparent_only", "b_effective": b_effective, "firth_fallback_count": firth_fallback_count, "coef_samples": {}, "selection_frequency": {}, "optimism": {}}
    suffix = "_fixed_lambda" if fixed_c is not None else ""
    return {
        "method": f"bootstrap_optimism{suffix}",
        "b_effective": b_effective,
        "firth_fallback_count": firth_fallback_count,
        "coef_samples": coef_samples,
        "selection_frequency": {term: selected_counts[term] / b_effective for term in selected_counts},
        "optimism": {key: float(np.mean(values)) for key, values in apparent_diffs.items() if values},
        "performance_ci": {
            key: [float(v) for v in np.percentile(np.asarray(values, dtype=float), [2.5, 97.5])]
            for key, values in corrected_samples.items()
            if len(values) >= 2
        },
        "oob_samples": oob_samples,
    }


def _fit_core(df, schema, setup, point=None):
    point = point if point is not None else _fit_point(df, schema, setup)
    ci_boot = _bootstrap_engine(df, schema, setup, point, int(setup.get("ciBootstrapB", 0)))
    diagnostics = dict(point["diagnostics"])
    diagnostics["firth_fallback_count"] = int(diagnostics.get("firth_fallback_count", 0)) + int(ci_boot.get("firth_fallback_count", 0))
    model_kind = point["model"]
    coef = point["coef"]
    se = point["se"]
    ci = point["ci"]
    pvals = point["pvals"]
    terms = point["terms"]
    sources = point["sources"]
    rows = []
    for term in coef.index:
        boot_values = ci_boot.get("coef_samples", {}).get(term, [])
        if boot_values:
            row_ci = tuple(np.percentile(np.exp(np.asarray(boot_values)), [2.5, 97.5]))
            ci_method = "bootstrap_percentile_fixed_lambda" if ci_boot["method"].endswith("fixed_lambda") else "bootstrap_percentile"
            pvalue = None if model_kind in {"ridge", "lasso", "elasticnet"} else (float(pvals[term]) if term in pvals.index and np.isfinite(pvals[term]) else None)
            row = {
                "label": term,
                "or": math.exp(float(coef[term])) if np.isfinite(float(coef[term])) else None,
                "ci_low": float(row_ci[0]) if np.isfinite(row_ci[0]) else None,
                "ci_high": float(row_ci[1]) if np.isfinite(row_ci[1]) else None,
                "p": pvalue,
                "ci_method": ci_method,
                "selection_frequency": ci_boot.get("selection_frequency", {}).get(term),
            }
        else:
            row_ci = tuple(ci.loc[term]) if hasattr(ci, "loc") and term in ci.index else None
            if point.get("ci_method") == "rubin" and row_ci is not None:
                ci_method = "rubin"
            else:
                ci_method = "profile_likelihood" if model_kind == "firth" and row_ci is not None else ("wald" if model_kind == "plain" and row_ci is not None else "none")
            pvalue = None if model_kind in {"ridge", "lasso", "elasticnet"} else (float(pvals[term]) if term in pvals.index and np.isfinite(pvals[term]) else None)
            row = _or_row(term, float(coef[term]), None if se is None or term not in se.index else float(se[term]), pvalue, row_ci, ci_method, None)
        row["variable"] = sources[terms.index(term)] if term in terms else term
        row["level"] = term.split("=", 1)[1] if "=" in term else None
        reference_levels = setup.get("referenceLevels", {})
        row["display_label"] = _display_term_label(term, schema, reference_levels)
        rows.append(row)
    equation_terms = [f"{float(beta):+.4g}*{term}" for term, beta in coef.items()]
    equation = "ln(p/(1-p)) = " + f"{point['intercept']:.4g}" + (" " + " ".join(equation_terms) if equation_terms else "")
    display_terms = [f"{float(beta):+.4g}*({_display_term_label(term, schema, reference_levels)})"
                     for term, beta in coef.items()]
    display_equation = "ln(odds) = " + f"{point['intercept']:.4g}" + (
        " " + " ".join(display_terms) if display_terms else "")
    return {
        "X": point["X"],
        "y": point["y"],
        "probs": point["probs"],
        "intercept": point["intercept"],
        "coef": coef,
        "model": model_kind,
        "rows": rows,
        "equation": equation,
        "display_equation": display_equation,
        "selected": point["selected"],
        "lambda": point["lambda"],
        "lambda_rule_applied": point.get("lambda_rule_applied"),
        "unmatched": point["unmatched"],
        "imputation_method": point["imputation_method"],
        "ci_bootstrap": ci_boot,
        "diagnostics": diagnostics,
    }


def fit_model(data_json, schema_json, setup_json):
    df = _dataframe(data_json)
    try:
        schema = _schema_map(schema_json)
        setup = _loads(setup_json)
        core = _fit_core(df, schema, setup)
        counts = core["y"].value_counts().to_dict()
        regime = json.loads(detect_regime(json.dumps({
            "n": int(len(core["y"])),
            "p": int(core["X"].shape[1]),
            "class_counts": {str(k): int(v) for k, v in counts.items()},
            "goal": setup.get("goal", "adjust"),
            "separation": bool(core["diagnostics"]["separated"] or core["diagnostics"]["quasi"]),
        })))
        regime["separation"] = {
            "separated": bool(core["diagnostics"]["separated"]),
            "quasi": bool(core["diagnostics"]["quasi"]),
            "convergence_warning": bool(core["diagnostics"].get("convergence_warning", False)),
            "culprits": core["diagnostics"].get("culprits", []),
            "detection": core["diagnostics"].get("detection"),
        }
        return _dump({
            "regime": regime,
            "adjusted": core["rows"],
            "equation": core["equation"],
            "display_equation": core.get("display_equation"),
            "selected": core["selected"],
            "model": core["model"],
            "lambda": core["lambda"],
            "lambda_rule_applied": core["lambda_rule_applied"],
            "outcome_event_level": core["diagnostics"].get("outcome_event_level"),
            "outcome_reference_level": core["diagnostics"].get("outcome_reference_level"),
            "unmatched": core["unmatched"],
            "imputation_method": core["imputation_method"],
            "diagnostics": core["diagnostics"],
        })
    except ModelingInputError as exc:
        return _input_error_payload(exc, df)
    except Exception as exc:
        return _input_error_payload(
            ModelingInputError(f"The model could not be fit for this data: {exc}"), df
        )


def _nested_performance_ci(df, schema, setup, point, corrected_point):
    validation_b = int(setup.get("validationB", 200))
    b_outer = min(validation_b, 80)
    b_inner = min(validation_b, 80)
    y = point["y"]
    seed = int(setup.get("seed", 20260229))
    fast_mode = bool(setup.get("fastMode", True))
    inner_cv = 2 if fast_mode else None
    
    metric_keys = ["auc", "calibration_slope", "calibration_intercept", "brier", "mcc", "f1"]
    outer_corrected_samples = {key: [] for key in metric_keys}
    
    for b in range(b_outer):
        try:
            df_star, _ = _stratified_bootstrap_df(df, y, seed + 4000 + b)
            boot_star = _fit_once(
                df_star, schema, setup,
                seed=seed + 5000 + b,
                fixed_c=None,
                inner_cv=inner_cv,
                resolved_model=point["model"]
            )
            if boot_star["y"].nunique() != 2:
                continue
                
            apparent_star = _metrics(boot_star["y"], boot_star["probs"])
            setup_star = dict(setup)
            setup_star["fastMode"] = True
            setup_star["seed"] = seed + 6000 + b * 200
            
            inner_res = _bootstrap_engine(df_star, schema, setup_star, boot_star, b_inner)
            optimism_star = inner_res.get("optimism", {})
            
            for key in metric_keys:
                val_app = apparent_star.get(key)
                val_opt = optimism_star.get(key)
                if val_app is not None and val_opt is not None and np.isfinite(val_app) and np.isfinite(val_opt):
                    outer_corrected_samples[key].append(float(val_app - val_opt))
        except Exception:
            continue
            
    res_ci = {}
    for key in metric_keys:
        samples = outer_corrected_samples[key]
        if len(samples) >= 2:
            ci_values = [float(v) for v in np.percentile(np.asarray(samples, dtype=float), [2.5, 97.5])]
            if key == "brier":
                ci_values = [max(0.0, ci_values[0]), max(0.0, ci_values[1])]
            res_ci[key] = ci_values
    return res_ci


def _validate_lr_core(df, schema, setup, point=None):
    point = point if point is not None else _fit_point(df, schema, setup)
    apparent = _metrics(point["y"], point["probs"])
    validation_boot = _bootstrap_engine(df, schema, setup, point, int(setup.get("validationB", 0)))
    optimism = validation_boot.get("optimism", {})
    method = validation_boot.get("method", "apparent_only")

    def corrected(key):
        value = apparent.get(key)
        if value is None:
            return None
        return float(value - optimism.get(key, 0.0)) if method != "apparent_only" else value

    corrected_point = {k: corrected(k) for k in ["auc", "calibration_slope", "calibration_intercept", "brier", "mcc", "f1"]}
    ci_mode = setup.get("validationCiMethod", "oob")

    curve_basis = "apparent"
    scalar_basis = "apparent" if method == "apparent_only" else "optimism_corrected"

    performance_ci = {}
    if method == "apparent_only":
        ci_method = "none"
    elif ci_mode == "full_sample":
        ci_method = "bootstrap_full_sample"
        performance_ci = validation_boot.get("performance_ci", {})
    elif ci_mode == "nested":
        ci_method = "bootstrap_nested"
        performance_ci = _nested_performance_ci(df, schema, setup, point, corrected_point)
    else:
        ci_method = "bootstrap_oob"
        for key in ["auc", "calibration_slope", "calibration_intercept", "brier", "mcc", "f1"]:
            oob_values = validation_boot.get("oob_samples", {}).get(key, [])
            if len(oob_values) >= 2:
                oob_ci = np.percentile(oob_values, [2.5, 97.5])
                oob_center = np.median(oob_values)
                pt = corrected_point[key]
                if pt is not None:
                    lo = float(pt + (oob_ci[0] - oob_center))
                    hi = float(pt + (oob_ci[1] - oob_center))
                    if key == "brier":
                        lo = max(0.0, lo)
                        hi = max(0.0, hi)
                    performance_ci[key] = [lo, hi]

    def ci_for(key):
        values = performance_ci.get(key)
        if not values or len(values) != 2:
            return None
        if not all(np.isfinite(v) for v in values):
            return None
        return [float(values[0]), float(values[1])]

    def _stable_scalar(key, value, ci):
        def bad(v):
            if v is None or not np.isfinite(v):
                return True
            if key in ("auc", "brier"):
                return not (-0.001 <= v <= 1.001)
            if key in ("calibration_slope", "calibration_intercept"):
                return abs(v) > CALIBRATION_STABILITY_BOUND
            return False

        ci_bad = False
        if ci is not None:
            ci_bad = any(bad(c) for c in ci)
        if bad(value):
            return None, None, "point estimate was non-finite or implausible for this metric"
        if ci_bad:
            return value, None, "confidence interval was non-finite or implausibly wide"
        return value, ci, None

    unstable = {}
    scalars = {}
    for key in ["auc", "calibration_slope", "calibration_intercept", "brier", "mcc", "f1"]:
        v, c, reason = _stable_scalar(key, corrected_point[key], ci_for(key))
        scalars[key] = (v, c)
        if reason:
            unstable[key] = reason

    return {
        "method": method,
        "b_effective": validation_boot.get("b_effective", 0),
        "ci_method": ci_method,
        "ci_level": 0.95,
        "auc_apparent": apparent["auc"],
        "auc_optimism": optimism.get("auc", 0 if method != "apparent_only" else None),
        "auc_corrected": scalars["auc"][0],
        "auc_corrected_ci": scalars["auc"][1],
        "calibration_slope": scalars["calibration_slope"][0],
        "calibration_slope_ci": scalars["calibration_slope"][1],
        "calibration_intercept": scalars["calibration_intercept"][0],
        "calibration_intercept_ci": scalars["calibration_intercept"][1],
        "brier": scalars["brier"][0],
        "brier_ci": scalars["brier"][1],
        "mcc": scalars["mcc"][0],
        "mcc_ci": scalars["mcc"][1],
        "f1": scalars["f1"][0],
        "f1_ci": scalars["f1"][1],
        "roc_curve": apparent["roc_curve"],
        "calibration_curve": apparent["calibration_curve"],
        "curve_basis": curve_basis,
        "scalar_basis": scalar_basis,
        "unstable_metrics": sorted(unstable.keys()),
        "unstable_reason": (
            "One or more validation metrics could not be reliably estimated - this is typically caused by separation, "
            "where a predictor almost perfectly predicts the outcome and the recalibration model diverges."
        ) if unstable else None,
        "unmatched": point["unmatched"],
    }


def validate_lr(data_json, schema_json, setup_json):
    df = _dataframe(data_json)
    try:
        schema = _schema_map(schema_json)
        setup = _loads(setup_json)
        return _dump(_validate_lr_core(df, schema, setup))
    except ModelingInputError as exc:
        return _input_error_payload(exc, df)


def run_logistic_model(data_json, schema_json, setup_json):
    df = _dataframe(data_json)
    try:
        schema = _schema_map(schema_json)
        setup = _loads(setup_json)
        univar = json.loads(univariate_or(data_json, schema_json, setup["outcome"], json.dumps(setup.get("predictors", [])), json.dumps(setup.get("referenceLevels", {})), setup_json))
        if isinstance(univar, dict) and univar.get("error"):
            return _dump(univar)
        point = _fit_point(df, schema, setup)
        core = _fit_core(df, schema, setup, point)
        counts = core["y"].value_counts().to_dict()
        regime = json.loads(detect_regime(json.dumps({
            "n": int(len(core["y"])),
            "p": int(core["X"].shape[1]),
            "class_counts": {str(k): int(v) for k, v in counts.items()},
            "goal": setup.get("goal", "adjust"),
            "separation": bool(core["diagnostics"]["separated"] or core["diagnostics"]["quasi"]),
        })))
        regime["separation"] = {
            "separated": bool(core["diagnostics"]["separated"]),
            "quasi": bool(core["diagnostics"]["quasi"]),
            "convergence_warning": bool(core["diagnostics"].get("convergence_warning", False)),
            "culprits": core["diagnostics"].get("culprits", []),
            "detection": core["diagnostics"].get("detection"),
        }
        validation = _validate_lr_core(df, schema, setup, point)
        return _dump({
            "regime": regime,
            "adjusted": core["rows"],
            "equation": core["equation"],
            "selected": core["selected"],
            "model": core["model"],
            "lambda": core["lambda"],
            "lambda_rule_applied": core["lambda_rule_applied"],
            "outcome_event_level": core["diagnostics"].get("outcome_event_level"),
            "outcome_reference_level": core["diagnostics"].get("outcome_reference_level"),
            "unmatched": core["unmatched"],
            "imputation_method": core["imputation_method"],
            "diagnostics": core["diagnostics"],
            "univariate": univar,
            "validation": validation,
            "decision_curve": _decision_curve(point["y"], point["probs"], basis="apparent"),
            "subgroups": _subgroup_performance_from_df(df, schema, setup, point["y"], point["probs"], point["y"].index, basis="apparent"),
        })
    except ModelingInputError as exc:
        return _input_error_payload(exc, df)
    except Exception as exc:
        return _input_error_payload(
            ModelingInputError(f"The model could not be fit for this data: {exc}"), df
        )


def _ml_shared_splits(y, seed, requested_splits, n_repeats):
    from sklearn.model_selection import RepeatedStratifiedKFold

    counts = y.value_counts()
    minority = int(counts.min()) if len(counts) else 0
    if minority < 2:
        raise ModelingInputError("Machine learning benchmark requires at least 2 observations in each outcome class for stratified cross-validation.")
    warnings_out = []
    n_splits = int(min(requested_splits, minority))
    if n_splits < requested_splits:
        warnings_out.append(f"Reduced CV folds from {requested_splits} to {n_splits} because the minority outcome class has {minority} observations.")
    splitter = RepeatedStratifiedKFold(n_splits=n_splits, n_repeats=int(n_repeats), random_state=int(seed))
    splits = [(train_idx, test_idx) for train_idx, test_idx in splitter.split(np.zeros(len(y)), y.to_numpy())]
    return splits, n_splits, warnings_out


class MixedNaiveBayes:
    _estimator_type = "classifier"

    def __init__(self, continuous_columns=None, categorical_columns=None, binarize=0.5):
        self.continuous_columns = list(continuous_columns or [])
        self.categorical_columns = list(categorical_columns or [])
        self.binarize = float(binarize)

    def get_params(self, deep=True):
        variant = getattr(self, "nb_variant_", "mixed_gaussian_bernoulli")
        return {
            "nb_variant": variant,
            "continuous_features": len(getattr(self, "continuous_columns_", self.continuous_columns)),
            "categorical_features": len(getattr(self, "categorical_columns_", self.categorical_columns)),
            "binarize": self.binarize,
        }

    def set_params(self, **params):
        if "continuous_columns" in params:
            self.continuous_columns = list(params["continuous_columns"] or [])
        if "categorical_columns" in params:
            self.categorical_columns = list(params["categorical_columns"] or [])
        if "binarize" in params:
            self.binarize = float(params["binarize"])
        return self

    def fit(self, X, y):
        from sklearn.naive_bayes import BernoulliNB, GaussianNB
        from sklearn.preprocessing import StandardScaler

        frame = pd.DataFrame(X).copy()
        self.feature_names_in_ = np.array([str(col) for col in frame.columns], dtype=object)
        self.continuous_columns_ = [col for col in self.continuous_columns if col in frame.columns]
        self.categorical_columns_ = [col for col in self.categorical_columns if col in frame.columns]
        if not self.continuous_columns_ and not self.categorical_columns_:
            self.continuous_columns_ = [col for col in frame.columns if "=" not in str(col)]
            self.categorical_columns_ = [col for col in frame.columns if "=" in str(col)]
        self.classes_, counts = np.unique(np.asarray(y).astype(int), return_counts=True)
        self.class_log_prior_ = np.log(counts.astype(float) / counts.sum())
        self.gaussian_ = None
        self.bernoulli_ = None
        self.scaler_ = None
        if self.continuous_columns_:
            self.scaler_ = StandardScaler()
            continuous = self.scaler_.fit_transform(frame[self.continuous_columns_].astype(float))
            self.gaussian_ = GaussianNB()
            self.gaussian_.fit(continuous, y)
        if self.categorical_columns_:
            categorical = (frame[self.categorical_columns_].astype(float).to_numpy() > self.binarize).astype(int)
            self.bernoulli_ = BernoulliNB(binarize=None)
            self.bernoulli_.fit(categorical, y)
        if self.gaussian_ is not None and self.bernoulli_ is not None:
            self.nb_variant_ = "mixed_gaussian_bernoulli"
        elif self.bernoulli_ is not None:
            self.nb_variant_ = "bernoulli"
        else:
            self.nb_variant_ = "gaussian"
        return self

    def _component_log_proba(self, model, values):
        logp = model.predict_log_proba(values)
        order = [int(np.where(model.classes_ == cls)[0][0]) for cls in self.classes_]
        return logp[:, order]

    def predict_proba(self, X):
        frame = pd.DataFrame(X, columns=getattr(self, "feature_names_in_", None)).copy()
        logp = None
        components = 0
        if self.gaussian_ is not None:
            continuous = self.scaler_.transform(frame[self.continuous_columns_].astype(float))
            logp = self._component_log_proba(self.gaussian_, continuous)
            components += 1
        if self.bernoulli_ is not None:
            categorical = (frame[self.categorical_columns_].astype(float).to_numpy() > self.binarize).astype(int)
            bernoulli_logp = self._component_log_proba(self.bernoulli_, categorical)
            logp = bernoulli_logp if logp is None else logp + bernoulli_logp
            components += 1
        if logp is None:
            raise ValueError("MixedNaiveBayes was fit without usable predictors.")
        if components > 1:
            logp = logp - (components - 1) * self.class_log_prior_
        logp = logp - logp.max(axis=1, keepdims=True)
        probs = np.exp(logp)
        return probs / probs.sum(axis=1, keepdims=True)

    def predict(self, X):
        probs = self.predict_proba(X)
        return self.classes_[np.argmax(probs, axis=1)]


def _ml_feature_groups(columns):
    categorical = [col for col in columns if "=" in str(col)]
    continuous = [col for col in columns if "=" not in str(col)]
    return continuous, categorical


def _ml_estimator(name, seed, fast_mode, inner_cv, feature_columns=None):
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LogisticRegressionCV
    from sklearn.model_selection import GridSearchCV
    from sklearn.naive_bayes import GaussianNB
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.svm import SVC

    if name == "Random Forest":
        return RandomForestClassifier(
            n_estimators=100 if fast_mode else 200,
            max_depth=None,
            min_samples_leaf=1,
            random_state=int(seed),
            n_jobs=1,
        )
    if name == "Naive Bayes":
        continuous, categorical = _ml_feature_groups(feature_columns or [])
        if categorical:
            return MixedNaiveBayes(continuous_columns=continuous, categorical_columns=categorical)
        return GaussianNB()
    if name == "SVM":
        if inner_cv is None:
            return Pipeline([
                ("scale", StandardScaler()),
                ("model", SVC(kernel="rbf", probability=True, C=1.0, gamma="scale", random_state=int(seed))),
            ])
        grid = {"model__C": [0.5, 1.0], "model__gamma": ["scale"]} if fast_mode else {"model__C": [0.25, 1.0, 4.0], "model__gamma": ["scale", "auto"]}
        pipe = Pipeline([
            ("scale", StandardScaler()),
            ("model", SVC(kernel="rbf", probability=True, random_state=int(seed))),
        ])
        return GridSearchCV(pipe, grid, scoring="roc_auc", cv=inner_cv, n_jobs=1)
    if name == "Ridge Logistic":
        if inner_cv is None:
            from sklearn.linear_model import LogisticRegression
            return Pipeline([
                ("scale", StandardScaler()),
                ("model", LogisticRegression(C=1.0, penalty="l2", solver="lbfgs", max_iter=1000, random_state=int(seed), n_jobs=1)),
            ])
        return Pipeline([
            ("scale", StandardScaler()),
            ("model", LogisticRegressionCV(
                Cs=5 if fast_mode else 10,
                cv=inner_cv,
                penalty="l2",
                solver="lbfgs",
                scoring="roc_auc",
                max_iter=1000,
                random_state=int(seed),
                n_jobs=1,
            )),
        ])
    raise ValueError(f"Unknown ML model: {name}")


def _ml_hyperparameters(estimator):
    """Return portable, meaningful fitted-estimator settings for reproducibility."""
    fitted = getattr(estimator, "best_estimator_", estimator)
    if hasattr(fitted, "named_steps"):
        fitted = fitted.named_steps.get("model", fitted)
    params = fitted.get_params(deep=False) if hasattr(fitted, "get_params") else {}
    allowed = {"n_estimators", "max_depth", "min_samples_leaf", "max_features", "bootstrap",
               "var_smoothing", "kernel", "C", "gamma", "probability", "penalty", "solver",
               "max_iter", "Cs", "cv", "scoring", "l1_ratio", "nb_variant",
               "continuous_features", "categorical_features", "binarize"}
    return {str(key): value for key, value in params.items()
            if key in allowed and isinstance(value, (str, int, float, bool, type(None)))}


def _ml_probabilities(model, X):
    if hasattr(model, "predict_proba"):
        return model.predict_proba(X)[:, 1]
    scores = model.decision_function(X)
    return 1 / (1 + np.exp(-scores))


def _calibration_summary(y_true, probs):
    from sklearn.metrics import brier_score_loss

    if len(y_true) == 0:
        return {"slope": None, "intercept": None, "curve": [], "brier": None}
    y_series = pd.Series(y_true).astype(int)
    p_series = pd.Series(np.clip(probs, EPS, 1 - EPS)).astype(float)
    brier = float(brier_score_loss(y_series, p_series))
    try:
        logits = np.log(p_series / (1 - p_series))
        cal = sm.Logit(y_series, sm.add_constant(pd.Series(logits, name="logit_p"))).fit(disp=False)
        intercept = float(cal.params["const"])
        slope = float(cal.params["logit_p"])
    except Exception:
        intercept = None
        slope = None

    curve = []
    try:
        bins = pd.qcut(p_series, q=min(5, len(np.unique(p_series))), duplicates="drop")
        grouped = pd.DataFrame({"p": p_series, "y": y_series, "bin": bins}).groupby("bin", observed=False)
        for _, group in grouped:
            curve.append({"predicted": float(group["p"].mean()), "observed": float(group["y"].mean()), "n": int(len(group))})
    except Exception:
        curve = [{"predicted": float(p_series.mean()), "observed": float(y_series.mean()), "n": int(len(y_series))}]
    return {"slope": slope, "intercept": intercept, "curve": curve, "brier": brier}


_BOUNDED_UNIT = {"auc", "sens", "spec", "balacc", "f1"}
_BOUNDED_CORR = {"mcc"}


def _metric_summary(values, repeat_values=None, metric_key=None):
    from scipy import stats as _sps
    from scipy.special import expit, logit

    if metric_key not in _BOUNDED_UNIT and metric_key not in _BOUNDED_CORR:
        raise ValueError(f"_metric_summary: unregistered metric key {metric_key!r}")

    clean = [float(v) for v in values if v is not None and np.isfinite(v)]
    repeat_clean = [float(v) for v in (repeat_values or []) if v is not None and np.isfinite(v)]
    if not clean and not repeat_clean:
        return {"mean": None, "sd": None, "ci_low": None, "ci_high": None}

    # Repeats are the independent replications under RepeatedStratifiedKFold;
    # base both the point summary spread and the CI on the per-repeat means.
    if len(repeat_clean) >= 2:
        k = len(repeat_clean)
        arr = np.asarray(repeat_clean, dtype=float)
        mean = float(np.mean(arr))
        sd = float(np.std(arr, ddof=1))
        summary = {"mean": mean, "sd": sd, "ci_low": None, "ci_high": None}

        if metric_key in _BOUNDED_UNIT:
            forward, inverse, basis, inside = logit, expit, "logit", np.all((arr > 0.0) & (arr < 1.0))
        else:
            forward, inverse, basis, inside = np.arctanh, np.tanh, "fisher_z", np.all(np.abs(arr) < 1.0)

        if not inside:
            return summary

        z = forward(arr)
        z_sd = float(np.std(z, ddof=1))
        if z_sd == 0.0:
            # D93(g): no run-to-run variability, so the interval is a point interval.
            # Report it at the arithmetic mean rather than at the back-transformed
            # centre: the forward/inverse round trip is not exact, and neither is
            # np.mean of identical values (np.mean([0.8, 0.8, 0.8]) is
            # 0.8000000000000002), so the two paths can differ by one unit in the
            # last place and place the reported mean outside its own interval.
            summary["ci_low"] = mean
            summary["ci_high"] = mean
            summary["ci_basis"] = basis
            return summary

        se = z_sd / math.sqrt(k)
        tcrit = float(_sps.t.ppf(0.975, k - 1))
        summary["ci_low"] = float(inverse(float(np.mean(z)) - tcrit * se))
        summary["ci_high"] = float(inverse(float(np.mean(z)) + tcrit * se))
        summary["ci_basis"] = basis
        return summary

    # Fewer than 2 usable repeat means: report the mean, fold-based sd, no CI.
    mean = float(np.mean(clean)) if clean else float(repeat_clean[0])
    sd = float(np.std(clean, ddof=1)) if len(clean) > 1 else 0.0
    return {"mean": mean, "sd": sd, "ci_low": None, "ci_high": None}


def _ml_artifacts(df, schema, setup, include_oof=False):
    from sklearn.inspection import permutation_importance
    from sklearn.metrics import balanced_accuracy_score, confusion_matrix, f1_score, matthews_corrcoef, roc_auc_score, roc_curve
    from sklearn.model_selection import StratifiedKFold

    seed = int(setup.get("seed", 20260229))
    fast_mode = bool(setup.get("fastMode", True))
    repeats = 3 if fast_mode else 10
    imputation_policy = setup.get("imputation", {}).get("policy", "complete_case")
    foldwise_imputation = imputation_policy in SIMPLE_POLICIES or imputation_policy in ML_IMPUTER_POLICIES or imputation_policy == "mice"
    if foldwise_imputation:
        work_df, extra_unmatched = _modeling_work_frame(df, schema, setup)
        y, _ = _prepare_binary_y(work_df[setup["outcome"]], setup["outcome"], schema.get(setup["outcome"], {}), setup)
        predictors = [name for name in setup.get("predictors", []) if name in work_df.columns]
        level_sets, effective_refs, level_warnings = _ml_level_sets(work_df, schema, predictors, setup.get("referenceLevels", {}))
        full_design_parts = []
        terms = []
        for name in predictors:
            col = schema.get(name, {})
            if col.get("confirmedType") in CATEGORICAL_TYPES:
                for lvl in level_sets.get(name, []):
                    term = f"{name}={lvl}"
                    full_design_parts.append(pd.Series(0.0, index=work_df.index, name=term))
                    terms.append(term)
            else:
                full_design_parts.append(pd.to_numeric(work_df[name], errors="coerce").astype(float).rename(name))
                terms.append(name)
        X = pd.concat(full_design_parts, axis=1).astype(float) if full_design_parts else pd.DataFrame(index=work_df.index)
        unmatched = extra_unmatched
        design_warnings = level_warnings
        unmatched = sorted(set(unmatched + extra_unmatched))
    else:
        X, y, terms, _, _, unmatched, design_warnings = _design(
            df,
            schema,
            setup["outcome"],
            setup.get("predictors", []),
            setup.get("referenceLevels", {}),
            setup=setup,
        )
    splits, n_splits, warnings_out = _ml_shared_splits(y, seed, 5, repeats)
    warnings_out.extend(design_warnings)
    ml_imputation_method = "complete_case"
    if imputation_policy in SIMPLE_POLICIES:
        ml_imputation_method = f"foldwise_simple_{imputation_policy}_numeric_foldmode_categorical"
        warnings_out.append("ML benchmark fits imputation inside each training fold and applies it to that fold's held-out rows.")
    elif imputation_policy == "knn":
        ml_imputation_method = "foldwise_knn_numeric_foldmode_categorical"
        warnings_out.append("ML benchmark fits kNN imputation inside each training fold and applies it to that fold's held-out rows.")
    elif imputation_policy == "rf":
        ml_imputation_method = "foldwise_rf_numeric_foldmode_categorical"
        warnings_out.append("ML benchmark fits random-forest imputation inside each training fold and applies it to that fold's held-out rows; the imputer is capped at 100 trees and 5 iterations.")
        if len(y) > 5000:
            warnings_out.append("Random-forest imputation can be slow on large datasets; consider kNN, simple imputation, or Fast validation if runtime is high.")
    elif imputation_policy == "mice":
        ml_imputation_method = "foldwise_mice_iterativeimputer_numeric_foldmode_categorical_single"
        warnings_out.append("ML benchmark uses one leak-free MICE-style imputation pass inside each training fold; full m x fold multiple-imputation pooling is limited to the logistic tab.")
    if unmatched:
        warnings_out.append(f"Omitted unmatched predictors: {', '.join(unmatched)}.")

    grid = np.linspace(0, 1, 100)
    model_names = ["Random Forest", "Naive Bayes", "SVM", "Ridge Logistic"]
    model_results = []
    oof_predictions = []
    subgroup_vars = [name for name in setup.get("subgroupVars", []) if name != setup.get("outcome")]
    subgroup_values_all = _subgroup_values_from_df(df, schema, setup, y.index) if subgroup_vars else {}

    for model_index, model_name in enumerate(model_names):
        fold_metrics = {"auc": [], "sens": [], "spec": [], "balacc": [], "mcc": [], "f1": []}
        repeat_fold_metrics = [{"auc": [], "sens": [], "spec": [], "balacc": [], "mcc": [], "f1": []} for _ in range(repeats)]
        roc_curves = []
        importances_by_term = {}
        pooled_y = []
        pooled_probs = []
        pooled_subgroups = {variable: [] for variable in subgroup_values_all}
        confusion_total = np.array([[0, 0], [0, 0]], dtype=int)

        for fold_index, (train_idx, test_idx) in enumerate(splits):
            repeat = int(fold_index // n_splits) + 1
            fold = int(fold_index % n_splits) + 1
            y_train = y.iloc[train_idx]
            y_test = y.iloc[test_idx]
            if foldwise_imputation:
                train_work = work_df.iloc[train_idx].copy()
                test_work = work_df.iloc[test_idx].copy()
                X_train, X_test, _ = _fold_local_design(
                    train_work,
                    test_work,
                    schema,
                    setup["outcome"],
                    predictors,
                    effective_refs,
                    level_sets,
                )
            else:
                X_train = X.iloc[train_idx].copy()
                X_test = X.iloc[test_idx].copy()
            if foldwise_imputation:
                try:
                    X_train, X_test = _fit_fold_imputer(X_train, X_test, setup, imputation_policy, seed + model_index * 1000 + fold_index)
                except Exception as exc:
                    warnings_out.append(f"{model_name} fold {fold} repeat {repeat} was skipped because foldwise imputation failed: {type(exc).__name__}.")
                    continue
            train_minority = int(y_train.value_counts().min()) if y_train.nunique() == 2 else 0
            inner_cv = StratifiedKFold(n_splits=max(2, min(3, train_minority)), shuffle=True, random_state=seed + 17 + fold_index) if train_minority >= 2 else None
            estimator = _ml_estimator(model_name, seed + model_index * 1000 + fold_index, fast_mode, inner_cv, list(X_train.columns))
            try:
                estimator.fit(X_train, y_train)
            except Exception as exc:
                warnings_out.append(f"{model_name} fold {fold} repeat {repeat} was skipped because fitting failed: {type(exc).__name__}.")
                continue
            probs = _ml_probabilities(estimator, X_test)
            pred = (probs >= CLASSIFICATION_THRESHOLD).astype(int)

            cm = confusion_matrix(y_test, pred, labels=[0, 1])
            confusion_total += cm
            tn, fp, fn, tp = cm.ravel()
            auc_value = float(roc_auc_score(y_test, probs)) if len(np.unique(y_test)) == 2 else None
            sens_value = float(tp / (tp + fn)) if (tp + fn) else None
            spec_value = float(tn / (tn + fp)) if (tn + fp) else None
            balacc_value = float(balanced_accuracy_score(y_test, pred))
            mcc_value = float(matthews_corrcoef(y_test, pred))
            f1_value = float(f1_score(y_test, pred, zero_division=0))
            fold_values = {"auc": auc_value, "sens": sens_value, "spec": spec_value, "balacc": balacc_value, "mcc": mcc_value, "f1": f1_value}
            for metric_key, metric_value in fold_values.items():
                fold_metrics[metric_key].append(metric_value)
                repeat_fold_metrics[repeat - 1][metric_key].append(metric_value)

            fpr, tpr, _ = roc_curve(y_test, probs)
            interp_tpr = np.interp(grid, fpr, tpr)
            interp_tpr[0] = 0.0
            interp_tpr[-1] = 1.0
            roc_curves.append(interp_tpr)
            pooled_y.extend([int(v) for v in y_test])
            pooled_probs.extend([float(v) for v in probs])
            for variable, values in subgroup_values_all.items():
                lookup = pd.Series(values, index=y.index)
                pooled_subgroups[variable].extend(lookup.loc[y_test.index].astype("object").tolist())
            if include_oof:
                for row_index, observed, prob in zip(y_test.index, y_test, probs):
                    oof_predictions.append({
                        "row_index": int(row_index),
                        "model": model_name,
                        "repeat": repeat,
                        "fold": fold,
                        "predicted_probability": float(prob),
                        "observed": int(observed),
                    })

            try:
                perm = permutation_importance(
                    estimator,
                    X_test,
                    y_test,
                    scoring="roc_auc",
                    n_repeats=2 if fast_mode else 5,
                    random_state=seed + 5000 + model_index * 1000 + fold_index,
                    n_jobs=1,
                )
                for term, score in zip(X_test.columns, perm.importances_mean):
                    importances_by_term.setdefault(str(term), []).append(float(score))
            except Exception:
                for term in X_test.columns:
                    importances_by_term.setdefault(str(term), []).append(np.nan)

        roc_stack = np.vstack(roc_curves) if roc_curves else np.zeros((1, len(grid)))
        ordered_terms = list(X.columns) if not foldwise_imputation else sorted(importances_by_term.keys())
        if importances_by_term:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", category=RuntimeWarning)
                importance_mean = np.array([np.nanmean(importances_by_term.get(str(term), [np.nan])) for term in ordered_terms], dtype=float)
            importance_available = bool(np.isfinite(importance_mean).any())
            importance_mean = np.maximum(0, np.nan_to_num(importance_mean, nan=0.0))
        else:
            importance_available = False
            importance_mean = np.zeros(len(ordered_terms))
        if not importance_available:
            warnings_out.append(f"Permutation importance unavailable for {model_name}; failed folds were not treated as zero importance.")
        max_importance = float(np.max(importance_mean)) if len(importance_mean) else 0.0
        scaled = importance_mean / max_importance * 100 if max_importance > 0 else importance_mean
        top_idx = np.argsort(-scaled)[:10]
        tn, fp, fn, tp = confusion_total.ravel()

        repeat_metric_means = {
            key: [
                float(np.mean([v for v in repeat_values[key] if v is not None and np.isfinite(v)]))
                for repeat_values in repeat_fold_metrics
                if [v for v in repeat_values[key] if v is not None and np.isfinite(v)]
            ]
            for key in fold_metrics
        }
        metrics = {
            key: _metric_summary(values, repeat_metric_means.get(key), metric_key=key)
            for key, values in fold_metrics.items()
        }
        metric_labels = {
            "auc": "AUC",
            "sens": "sensitivity",
            "spec": "specificity",
            "balacc": "balanced accuracy",
            "mcc": "MCC",
            "f1": "F1",
        }
        for key, summary in metrics.items():
            if summary["mean"] is not None and summary["ci_low"] is None and len(repeat_metric_means.get(key, [])) >= 2:
                bound_text = "0 or 1" if key in _BOUNDED_UNIT else "-1 or 1"
                warnings_out.append(
                    f"{model_name}: no 95% interval across CV repetitions for {metric_labels[key]} because at least one repeat reached the metric's boundary ({bound_text}); the point estimate and per-repeat SD are still reported."
                )
        subgroup_results = [
            _subgroup_performance_for_values(pooled_y, pooled_probs, values, variable, "pooled_repeated_cv", min_events=int(setup.get("subgroupMinEvents", 5) or 5))
            for variable, values in pooled_subgroups.items()
        ]
        model_results.append({
            "name": model_name,
            "metrics": metrics,
            "roc": {
                "grid": grid.tolist(),
                "mean": np.mean(roc_stack, axis=0).tolist(),
                "sd": np.std(roc_stack, axis=0, ddof=1).tolist() if len(roc_stack) > 1 else np.zeros(len(grid)).tolist(),
            },
            "var_importance": [{"name": str(ordered_terms[i]), "score": float(scaled[i])} for i in top_idx if i < len(ordered_terms)],
            "importance_available": importance_available,
            "calibration": _calibration_summary(pooled_y, pooled_probs),
            "confusion": {"tp": int(tp), "fp": int(fp), "fn": int(fn), "tn": int(tn)},
            "confusion_basis": "pooled_repeated_cv",
            "classification_threshold": float(CLASSIFICATION_THRESHOLD),
            "cv_folds": int(n_splits),
            "cv_repeats": int(repeats),
            "decision_curve": _decision_curve(pooled_y, pooled_probs, basis="pooled_repeated_cv"),
            "subgroups": subgroup_results,
            "hyperparameters": _ml_hyperparameters(estimator),
        })

    comparison = [
        {
            "model": item["name"],
            "auc": item["metrics"]["auc"],
            "sens": item["metrics"]["sens"],
            "spec": item["metrics"]["spec"],
            "balacc": item["metrics"]["balacc"],
            "mcc": item["metrics"]["mcc"],
            "f1": item["metrics"]["f1"],
        }
        for item in model_results
    ]
    return {
        "X": X,
        "y": y,
        "terms": terms,
        "models": model_results,
        "comparison": comparison,
        "folds": {"n_splits": n_splits, "n_repeats": repeats, "seed": seed},
        "imputation_method": ml_imputation_method,
        "n_evaluated": int(len(y)),
        "confusion_basis": "pooled_repeated_cv",
        "classification_threshold": float(CLASSIFICATION_THRESHOLD),
        "warnings": warnings_out,
        "oof_predictions": sorted(oof_predictions, key=lambda row: (row["model"], row["repeat"], row["fold"], row["row_index"])),
    }


def run_ml_benchmark(data_json, schema_json, setup_json):
    df = _dataframe(data_json)
    try:
        schema = _schema_map(schema_json)
        setup = _loads(setup_json)
        artifacts = _ml_artifacts(df, schema, setup, include_oof=False)
        return _dump({
            "models": artifacts["models"],
            "comparison": artifacts["comparison"],
            "folds": artifacts["folds"],
            "imputation_method": artifacts["imputation_method"],
            "n_evaluated": artifacts["n_evaluated"],
            "confusion_basis": artifacts["confusion_basis"],
            "classification_threshold": artifacts["classification_threshold"],
            "warnings": artifacts["warnings"],
        })
    except ModelingInputError as exc:
        return _input_error_payload(exc, df)
    except Exception as exc:
        return _input_error_payload(ModelingInputError(f"Machine learning benchmark failed: {exc}"), df)


def _original_outcome_label(mapping, value):
    for raw, coded in mapping.items():
        if int(coded) == int(value):
            return str(raw)
    return str(value)


def export_modeling_data(data_json, schema_json, setup_json):
    df = _dataframe(data_json)
    try:
        schema = _schema_map(schema_json)
        setup = _loads(setup_json)
        point = _fit_point(df, schema, setup)
        X = point["X"]
        y = point["y"]
        y_mapping = _design(df, schema, setup["outcome"], setup.get("predictors", []), setup.get("referenceLevels", {}), setup=setup)[4]

        matrix_rows = []
        for row_index in X.index:
            row = {
                "row_index": int(row_index),
                "outcome": int(y.loc[row_index]),
                "outcome_label": _original_outcome_label(y_mapping, y.loc[row_index]),
                "imputation_method": point["imputation_method"],
            }
            for term in point["terms"]:
                row[term] = float(X.loc[row_index, term]) if term in X.columns and pd.notna(X.loc[row_index, term]) else None
            matrix_rows.append(row)

        lr_probs = [
            {
                "row_index": int(row_index),
                "predicted_probability": float(prob),
                "outcome": int(y.loc[row_index]),
            }
            for row_index, prob in point["probs"].items()
        ]

        ml_artifacts = _ml_artifacts(df, schema, setup, include_oof=True)
        ml_roc = []
        ml_calibration = []
        ml_importance = []
        ml_metrics = []
        for model in ml_artifacts["models"]:
            name = model["name"]
            for fpr, mean_tpr, sd_tpr in zip(model["roc"]["grid"], model["roc"]["mean"], model["roc"]["sd"]):
                ml_roc.append({"model": name, "fpr": float(fpr), "mean_tpr": float(mean_tpr), "sd_tpr": float(sd_tpr)})
            for point_row in model["calibration"]["curve"]:
                ml_calibration.append({"model": name, **point_row})
            for item in model["var_importance"]:
                ml_importance.append({"model": name, "term": item["name"], "scaled_importance": item["score"]})
            for metric, summary in model["metrics"].items():
                ml_metrics.append({
                    "model": name,
                    "metric": metric,
                    "mean": summary["mean"],
                    "sd": summary["sd"],
                    "ci_low": summary.get("ci_low"),
                    "ci_high": summary.get("ci_high"),
                })

        return _dump({
            "model_input_matrix": matrix_rows,
            "lr_predicted_probabilities": lr_probs,
            "ml_oof_predictions": ml_artifacts["oof_predictions"],
            "ml_roc_curve": ml_roc,
            "ml_calibration": ml_calibration,
            "ml_variable_importance": ml_importance,
            "ml_metrics": ml_metrics,
            "warnings": ml_artifacts["warnings"],
        })
    except ModelingInputError as exc:
        return _input_error_payload(exc, df)
    except Exception as exc:
        return _input_error_payload(ModelingInputError(f"Modeling data export failed: {exc}"), df)
