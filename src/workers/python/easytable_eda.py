import base64
import io
import json

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from scipy.stats import chi2, pearsonr
from statsmodels.graphics.mosaicplot import mosaic
from statsmodels.stats.outliers_influence import variance_inflation_factor


DEFAULT_PLOT_THEME = {
    "seaborn_style": "whitegrid",
    "color_palette": ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", "#EDC948", "#B07AA1", "#FF9DA7"],
    "font_family": "DejaVu Sans",
    "font_size_base": 9,
    "despine": False,
    "bar_edge_color": "white",
    "bar_edge_linewidth": 0.5,
    "line_width": 1.2,
    "figure_dpi_screen": 150,
    "figure_dpi_export": 300,
}

VALID_SEABORN_STYLES = {"ticks", "white", "whitegrid", "darkgrid", "dark"}
CATEGORICAL_TYPES = {"binary", "categorical_nominal", "categorical_ordinal"}
MAX_MOSAIC_PAIRS = 3


def _coerce_json(value):
    if isinstance(value, str):
        return json.loads(value)
    return value


def _coerce_theme(plot_theme):
    plot_theme = _coerce_json(plot_theme)
    theme = dict(DEFAULT_PLOT_THEME)
    if plot_theme:
        theme.update(plot_theme)
    if theme["seaborn_style"] not in VALID_SEABORN_STYLES:
        raise ValueError(f"Invalid seaborn_style: {theme['seaborn_style']}")
    if len(theme.get("color_palette", [])) < 2:
        raise ValueError("plot_theme.color_palette must contain at least 2 colors")
    return theme


def _apply_theme(theme):
    base_size = int(theme.get("font_size_base", DEFAULT_PLOT_THEME["font_size_base"]))
    sns.set_theme(style=theme["seaborn_style"], context="paper", font_scale=1.0)
    plt.rcParams.update({
        "font.family": theme.get("font_family", "DejaVu Sans"),
        "font.size": base_size,
        "axes.labelsize": base_size,
        "axes.titlesize": base_size + 1,
        "xtick.labelsize": max(base_size - 1, 1),
        "ytick.labelsize": max(base_size - 1, 1),
        "figure.titlesize": base_size + 2,
        "lines.linewidth": float(theme.get("line_width", DEFAULT_PLOT_THEME["line_width"])),
    })


def _figure_to_base64(fig, dpi, tight=True):
    buf = io.BytesIO()
    save_kwargs = {"format": "png", "dpi": dpi}
    if tight:
        save_kwargs["bbox_inches"] = "tight"
    fig.savefig(buf, **save_kwargs)
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")


def _display_label(column):
    return column.get("displayLabel") or column.get("label") or column["name"]


def _numeric_equal(left, right):
    try:
        return float(str(left)) == float(str(right))
    except Exception:
        return False


def _format_code_as_integer(code):
    text = str(code)
    try:
        number = float(text)
        if number.is_integer():
            return str(int(number))
    except Exception:
        pass
    return text


def _resolve_level_label(code, column):
    if not column:
        return _format_code_as_integer(code)
    text = str(code)
    for level in column.get("levels") or []:
        level_code = level.get("code")
        if str(level_code) == text or _numeric_equal(level_code, text):
            return level.get("label") or _format_code_as_integer(text)
    return _format_code_as_integer(text)


def _ticklabel_overlap(fig, ax, axis="x"):
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    ticklabels = ax.get_xticklabels() if axis == "x" else ax.get_yticklabels()
    boxes = [label.get_window_extent(renderer=renderer) for label in ticklabels if label.get_visible() and label.get_text()]
    for index, left in enumerate(boxes):
        for right in boxes[index + 1:]:
            if left.overlaps(right):
                return True
    return False


def _fit_categorical_axis_labels(fig, ax, axis="x", min_width_in=3.0, max_width_in=8.0):
    """Grow the figure and/or rotate tick labels so they do not overlap each other.

    Duplicated in easytable_plots.py because Pyodide injects these worker files as
    raw scripts rather than importing a shared Python module.
    """
    fig.canvas.draw()
    ticklabels = ax.get_xticklabels() if axis == "x" else ax.get_yticklabels()
    ticklabels = [label for label in ticklabels if label.get_visible() and label.get_text()]
    if not ticklabels:
        return {"rotated": False, "figsize": tuple(fig.get_size_inches()), "overlap": False}
    renderer = fig.canvas.get_renderer()
    label_widths_in = [
        label.get_window_extent(renderer=renderer).width / fig.dpi
        for label in ticklabels
    ]
    axis_width_in = ax.get_window_extent(renderer=renderer).width / fig.dpi
    needed_in = sum(label_widths_in) + 0.15 * max(0, len(ticklabels) - 1)
    rotated = False
    if axis_width_in > 0 and needed_in > axis_width_in:
        grow_to = min(max_width_in, max(min_width_in, fig.get_size_inches()[0] * (needed_in / axis_width_in)))
        fig.set_size_inches(grow_to, fig.get_size_inches()[1])
        fig.canvas.draw()
        axis_width_in = ax.get_window_extent(renderer=fig.canvas.get_renderer()).width / fig.dpi
        if needed_in > axis_width_in:
            rotated = True
            for angle in (30, 45, 60, 90):
                ha = "center" if angle == 90 else "right"
                plt.setp(ticklabels, rotation=angle, ha=ha, rotation_mode="anchor")
                fig.canvas.draw()
                if not _ticklabel_overlap(fig, ax, axis):
                    break
    return {"rotated": rotated, "figsize": tuple(float(v) for v in fig.get_size_inches()), "overlap": _ticklabel_overlap(fig, ax, axis)}


def _fit_side_legend(fig, ax, legend, max_width_in=6.0):
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    legend_width_in = legend.get_window_extent(renderer=renderer).width / fig.dpi
    fig_width, fig_height = fig.get_size_inches()
    reserve_fraction = min(0.42, (legend_width_in + 0.25) / max(fig_width, 0.1))
    ax_right = max(0.52, min(0.78, 1.0 - reserve_fraction))
    fig.subplots_adjust(right=ax_right)
    fig.canvas.draw()
    legend_box = legend.get_window_extent(renderer=fig.canvas.get_renderer())
    overflow_in = max(0.0, (legend_box.x1 - fig.bbox.x1) / fig.dpi)
    if overflow_in > 0:
        fig.set_size_inches(min(max_width_in, fig_width + overflow_in + 0.2), fig_height)
        fig.subplots_adjust(right=ax_right)
        fig.canvas.draw()


def _bbox_overlap(fig, left, right):
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    return bool(left.get_window_extent(renderer=renderer).overlaps(right.get_window_extent(renderer=renderer)))


def _columns_by_name(schema_cols):
    return {column["name"]: column for column in schema_cols}


def _dataframe_from_easytable(data_dict):
    col_names = [column["name"] for column in data_dict.get("columns", [])]
    return pd.DataFrame(data_dict.get("rows", []), columns=col_names)


def _render_missingness_heatmap(missing_matrix, labels, theme):
    _apply_theme(theme)
    dpi = int(theme.get("figure_dpi_screen", DEFAULT_PLOT_THEME["figure_dpi_screen"]))
    width = max(4, min(10, len(labels) * 0.55))
    height = max(2, min(8, len(missing_matrix) * 0.03 + 1.2))
    fig, ax = plt.subplots(figsize=(width, height))
    sns.heatmap(
        missing_matrix,
        cmap=["white", "#94a3b8"],
        cbar=False,
        linewidths=0.5,
        xticklabels=labels,
        yticklabels=False,
        ax=ax,
    )
    ax.set_xlabel("")
    ax.set_ylabel(f"Sampled rows (N={len(missing_matrix)})")
    ax.tick_params(axis="x", rotation=-45)
    fig.tight_layout()
    return _figure_to_base64(fig, dpi)


def _render_boxplot(df, group_col, value_col, display_label, group_label, theme, group_column=None):
    _apply_theme(theme)
    dpi = int(theme.get("figure_dpi_screen", DEFAULT_PLOT_THEME["figure_dpi_screen"]))
    palette = theme.get("color_palette", DEFAULT_PLOT_THEME["color_palette"])
    plot_df = df[[group_col, value_col]].dropna(subset=[group_col]).copy()
    plot_df[value_col] = pd.to_numeric(plot_df[value_col], errors="coerce")
    plot_df = plot_df.dropna(subset=[value_col])
    if plot_df.empty:
        return None
    plot_df["_group_label"] = plot_df[group_col].map(lambda code: _resolve_level_label(code, group_column))
    fig, ax = plt.subplots(figsize=(3, 2))
    sns.boxplot(data=plot_df, x="_group_label", y=value_col, palette=palette, hue="_group_label", legend=False, ax=ax)
    ax.set_xlabel(group_label)
    ax.set_ylabel(display_label)
    _fit_categorical_axis_labels(fig, ax, axis="x")
    if theme.get("despine", True):
        sns.despine(fig=fig)
    fig.tight_layout()
    return _figure_to_base64(fig, dpi)


def _render_stacked_bar(df, group_col, value_col, display_label, group_label, theme, value_column=None):
    _apply_theme(theme)
    dpi = int(theme.get("figure_dpi_screen", DEFAULT_PLOT_THEME["figure_dpi_screen"]))
    palette = theme.get("color_palette", DEFAULT_PLOT_THEME["color_palette"])
    plot_df = df[[group_col, value_col]].dropna().copy()
    if plot_df.empty:
        return None
    plot_df[group_col] = plot_df[group_col].astype(str)
    plot_df[value_col] = plot_df[value_col].astype(str)
    top_levels = plot_df[value_col].value_counts().head(10).index
    plot_df[value_col] = np.where(plot_df[value_col].isin(top_levels), plot_df[value_col], "Other")
    table = pd.crosstab(plot_df[group_col], plot_df[value_col], normalize="index") * 100
    if table.empty:
        return None
    fig, ax = plt.subplots(figsize=(3.3, 2.1))
    left = np.zeros(len(table.index))
    for idx, level in enumerate(table.columns):
        values = table[level].to_numpy()
        ax.barh(table.index, values, left=left, label=_resolve_level_label(level, value_column), color=palette[idx % len(palette)])
        left += values
    ax.set_xlabel("% within group")
    ax.set_ylabel(group_label)
    ax.set_xlim(0, 100)
    ax.set_title(display_label)
    legend = ax.legend(
        loc="center left",
        bbox_to_anchor=(1.02, 0.5),
        frameon=False,
        fontsize=max(int(theme.get("font_size_base", 9)) - 2, 6),
        title=None,
    )
    _fit_side_legend(fig, ax, legend)
    if theme.get("despine", True):
        sns.despine(fig=fig)
    fig.tight_layout()
    return _figure_to_base64(fig, dpi)


def _debug_eda_boxplot_layout(data_dict, group_col, value_col, theme, group_column=None):
    data_dict = _coerce_json(data_dict)
    theme = _coerce_theme(theme)
    group_column = _coerce_json(group_column) if group_column is not None else None
    _apply_theme(theme)
    df = _dataframe_from_easytable(data_dict)
    palette = theme.get("color_palette", DEFAULT_PLOT_THEME["color_palette"])
    plot_df = df[[group_col, value_col]].dropna(subset=[group_col]).copy()
    plot_df[value_col] = pd.to_numeric(plot_df[value_col], errors="coerce")
    plot_df = plot_df.dropna(subset=[value_col])
    plot_df["_group_label"] = plot_df[group_col].map(lambda code: _resolve_level_label(code, group_column))
    fig, ax = plt.subplots(figsize=(3, 2))
    sns.boxplot(data=plot_df, x="_group_label", y=value_col, palette=palette, hue="_group_label", legend=False, ax=ax)
    ax.set_xlabel(group_col)
    ax.set_ylabel(value_col)
    debug = _fit_categorical_axis_labels(fig, ax, axis="x")
    fig.tight_layout()
    debug["overlap"] = _ticklabel_overlap(fig, ax, "x")
    debug["figsize"] = tuple(float(v) for v in fig.get_size_inches())
    debug["tick_labels"] = [label.get_text() for label in ax.get_xticklabels()]
    plt.close(fig)
    return debug


def _debug_eda_stacked_bar_layout(data_dict, group_col, value_col, theme, value_column=None):
    data_dict = _coerce_json(data_dict)
    theme = _coerce_theme(theme)
    value_column = _coerce_json(value_column) if value_column is not None else None
    _apply_theme(theme)
    df = _dataframe_from_easytable(data_dict)
    palette = theme.get("color_palette", DEFAULT_PLOT_THEME["color_palette"])
    plot_df = df[[group_col, value_col]].dropna().copy()
    plot_df[group_col] = plot_df[group_col].astype(str)
    plot_df[value_col] = plot_df[value_col].astype(str)
    top_levels = plot_df[value_col].value_counts().head(10).index
    plot_df[value_col] = np.where(plot_df[value_col].isin(top_levels), plot_df[value_col], "Other")
    table = pd.crosstab(plot_df[group_col], plot_df[value_col], normalize="index") * 100
    fig, ax = plt.subplots(figsize=(3.3, 2.1))
    left = np.zeros(len(table.index))
    for idx, level in enumerate(table.columns):
        values = table[level].to_numpy()
        ax.barh(table.index, values, left=left, label=_resolve_level_label(level, value_column), color=palette[idx % len(palette)])
        left += values
    ax.set_xlabel("% within group")
    ax.set_ylabel(group_col)
    ax.set_xlim(0, 100)
    ax.set_title(value_col)
    legend = ax.legend(
        loc="center left",
        bbox_to_anchor=(1.02, 0.5),
        frameon=False,
        fontsize=max(int(theme.get("font_size_base", 9)) - 2, 6),
        title=None,
    )
    _fit_side_legend(fig, ax, legend)
    fig.tight_layout()
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    result = {
        "legend_loc": legend._loc,
        "legend_anchor": tuple(float(v) for v in legend.get_bbox_to_anchor()._bbox.bounds),
        "legend_x_label_overlap": bool(legend.get_window_extent(renderer=renderer).overlaps(ax.xaxis.label.get_window_extent(renderer=renderer))),
        "figsize": tuple(float(v) for v in fig.get_size_inches()),
        "legend_labels": [text.get_text() for text in legend.get_texts()],
    }
    plt.close(fig)
    return result


def _render_mosaic(df, col_a, col_b, display_a, display_b, theme):
    _apply_theme(theme)
    dpi = int(theme.get("figure_dpi_screen", DEFAULT_PLOT_THEME["figure_dpi_screen"]))
    plot_df = df[[col_a, col_b]].dropna().copy()
    if plot_df.empty:
        return None
    plot_df[col_a] = plot_df[col_a].astype(str)
    plot_df[col_b] = plot_df[col_b].astype(str)
    if plot_df[col_a].nunique() < 2 or plot_df[col_b].nunique() < 2:
        return None
    # Keep the most common levels so the figure remains readable and deterministic.
    for col in [col_a, col_b]:
        top_levels = plot_df[col].value_counts().head(6).index
        plot_df[col] = np.where(plot_df[col].isin(top_levels), plot_df[col], "Other")
    counts = plot_df.groupby([col_a, col_b], observed=True).size()
    if counts.empty:
        return None
    fig, ax = plt.subplots(figsize=(4.2, 3.0))
    mosaic(counts.to_dict(), ax=ax, gap=0.02, labelizer=lambda key: "")
    ax.set_xlabel(display_a)
    ax.set_ylabel(display_b)
    ax.set_title(f"{display_a} x {display_b}")
    fig.tight_layout()
    return _figure_to_base64(fig, dpi)


def _compute_mosaic_pairs(df, categorical_cols, theme):
    pairs = []
    candidates = []
    for i, col_a in enumerate(categorical_cols):
        for col_b in categorical_cols[i + 1:]:
            name_a = col_a["name"]
            name_b = col_b["name"]
            plot_df = df[[name_a, name_b]].dropna()
            if plot_df.empty:
                continue
            n_a = plot_df[name_a].nunique()
            n_b = plot_df[name_b].nunique()
            if n_a < 2 or n_b < 2:
                continue
            candidates.append((min(n_a * n_b, 10_000), name_a, name_b, col_a, col_b))
    candidates.sort(key=lambda item: (item[0], item[1], item[2]))
    for _, name_a, name_b, col_a, col_b in candidates[:MAX_MOSAIC_PAIRS]:
        display_a = _display_label(col_a)
        display_b = _display_label(col_b)
        png = _render_mosaic(df, name_a, name_b, display_a, display_b, theme)
        if png:
            pairs.append({
                "col_a": name_a,
                "col_b": name_b,
                "display_a": display_a,
                "display_b": display_b,
                "png": png,
            })
    return pairs


def _compute_vif(df, continuous_cols):
    if len(continuous_cols) < 2:
        return []
    names = [column["name"] for column in continuous_cols]
    design = df[names].apply(pd.to_numeric, errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()
    if len(design) < 3:
        return []
    kept = [name for name in names if design[name].nunique(dropna=True) > 1]
    if len(kept) < 2:
        return []
    design = design[kept].astype(float)
    import statsmodels.api as sm
    design_c = sm.add_constant(design, has_constant="add")
    values = design_c.to_numpy(dtype=float)
    rows = []
    for offset, name in enumerate(kept):
        try:
            vif_value = float(variance_inflation_factor(values, offset + 1))
        except Exception:
            vif_value = float("inf")
        if np.isfinite(vif_value):
            rounded = round(vif_value, 3)
            severity = "high" if vif_value > 10 else "elevated" if vif_value > 5 else "ok"
        else:
            rounded = None
            severity = "high"
        rows.append({
            "variable": name,
            "display_label": _display_label(next(column for column in continuous_cols if column["name"] == name)),
            "vif": rounded,
            "severity": severity,
        })
    rows.sort(key=lambda item: (-1 if item["vif"] is None else -item["vif"], item["variable"]))
    return rows


def _little_mcar_test(df, active_schema_cols):
    numeric_names = [
        column["name"] for column in active_schema_cols
        if column["name"] in df.columns and column.get("confirmedType") == "continuous"
    ]
    if len(numeric_names) < 2 or len(df) == 0:
        return None
    x = df[numeric_names].apply(pd.to_numeric, errors="coerce").replace([np.inf, -np.inf], np.nan)
    if not x.isna().any().any():
        return {
            "statistic": 0.0,
            "df": 0,
            "p_value": 1.0,
            "n_patterns": 1,
            "note": "No missing continuous values were detected; Little's MCAR test is not informative.",
        }

    means = x.mean(skipna=True)
    cov = x.cov(min_periods=1)
    if means.isna().any() or cov.empty:
        return None
    cov = cov.reindex(index=numeric_names, columns=numeric_names)
    if cov.isna().all().all():
        return None
    cov = cov.fillna(0.0)

    patterns = {}
    for _, row in x.iterrows():
        observed = tuple(bool(not pd.isna(row[name])) for name in numeric_names)
        if not any(observed):
            continue
        patterns.setdefault(observed, []).append(row)

    statistic = 0.0
    df_value = 0
    usable_patterns = 0
    for observed, rows in patterns.items():
        obs_names = [name for name, keep in zip(numeric_names, observed) if keep]
        pattern_df = pd.DataFrame(rows)[obs_names]
        pattern_df = pattern_df.dropna(how="any")
        if pattern_df.empty:
            continue
        mean_diff = (pattern_df.mean() - means[obs_names]).to_numpy(dtype=float)
        cov_obs = cov.loc[obs_names, obs_names].to_numpy(dtype=float)
        try:
            inv_cov = np.linalg.pinv(cov_obs)
            contribution = len(pattern_df) * float(mean_diff.T @ inv_cov @ mean_diff)
        except Exception:
            contribution = 0.0
        if np.isfinite(contribution):
            statistic += contribution
        df_value += len(obs_names)
        usable_patterns += 1

    df_value -= len(numeric_names)
    if usable_patterns <= 1 or df_value <= 0:
        return {
            "statistic": round(float(statistic), 4),
            "df": max(int(df_value), 0),
            "p_value": None,
            "n_patterns": int(usable_patterns),
            "note": "Little's MCAR test requires multiple usable missingness patterns with positive degrees of freedom.",
            "verdict": None,
            "approximation_note": None,
        }

    p_value = float(chi2.sf(statistic, df_value))
    return {
        "statistic": round(float(statistic), 4),
        "df": int(df_value),
        "p_value": round(p_value, 3),
        "n_patterns": int(usable_patterns),
        "note": "A low P-value suggests the missingness is not completely at random; it does not by itself prove the data are MAR or MNAR.",
        "experimental": True,
        "verdict": "consistent_with_mcar" if p_value >= 0.05 else "inconsistent_with_mcar",
        "approximation_note": "This is a closed-form approximation using available-case means and pairwise covariances rather than EM estimates; the P-value is approximate and can disagree with reference implementations (e.g. R naniar::mcar_test). Treat it as a screening signal, not a formal test.",
    }


def compute_eda(
    data_dict,
    schema_dict,
    plot_theme,
    grouping_variable=None,
    max_heatmap_rows=300,
    corr_flag_threshold=0.7,
    missing_indicator_threshold=0.5,
):
    """
    Returns a dict with three top-level keys: missingness, correlations, bivariate.
    Inputs may be dicts or JSON strings to support Pyodide message passing.
    """
    data_dict = _coerce_json(data_dict)
    schema_dict = _coerce_json(schema_dict)
    theme = _coerce_theme(plot_theme)
    df = _dataframe_from_easytable(data_dict)
    schema_cols = schema_dict.get("columns", [])
    active_schema_cols = [column for column in schema_cols if not column.get("exclusionReason")]
    schema_names = [column["name"] for column in active_schema_cols if column["name"] in df.columns]
    by_name = _columns_by_name(schema_cols)

    per_variable = []
    for col_name in schema_names:
        column = by_name[col_name]
        values = df[col_name]
        missing_count = int(values.isna().sum())
        missing_pct = round(missing_count / len(df) * 100, 1) if len(df) > 0 else 0.0
        per_variable.append({
            "name": col_name,
            "display_label": _display_label(column),
            "missing_count": missing_count,
            "missing_pct": missing_pct,
        })
    per_variable.sort(key=lambda item: item["missing_pct"], reverse=True)

    cols_with_missing = [name for name in schema_names if df[name].isna().any()]
    indicator_correlations = []
    for i, col_a in enumerate(cols_with_missing):
        for col_b in cols_with_missing[i + 1:]:
            x = df[col_a].isna().astype(float)
            y = df[col_b].isna().astype(float)
            if x.std() == 0 or y.std() == 0:
                continue
            r, _ = pearsonr(x, y)
            if np.isfinite(r) and abs(r) >= missing_indicator_threshold:
                indicator_correlations.append({
                    "col_a": col_a,
                    "col_b": col_b,
                    "display_a": _display_label(by_name[col_a]),
                    "display_b": _display_label(by_name[col_b]),
                    "correlation": round(float(r), 3),
                })
    indicator_correlations.sort(key=lambda item: abs(item["correlation"]), reverse=True)

    heatmap_png = None
    if len(cols_with_missing) >= 3 and len(df) > 0:
        sample_n = min(int(max_heatmap_rows), len(df))
        sample_df = df.sample(sample_n, random_state=42)
        missing_matrix = sample_df[cols_with_missing].isna().astype(int)
        labels = [_display_label(by_name[name]) for name in cols_with_missing]
        heatmap_png = _render_missingness_heatmap(missing_matrix, labels, theme)

    cont_cols = [
        column for column in active_schema_cols
        if column["name"] in df.columns
        and column.get("confirmedType") == "continuous"
    ]
    cont_names = [column["name"] for column in cont_cols]
    categorical_cols = [
        column for column in active_schema_cols
        if column["name"] in df.columns
        and column.get("confirmedType") in CATEGORICAL_TYPES
    ]
    pearson_flat = []
    spearman_flat = []
    flagged = []
    variable_order = []
    if len(cont_names) >= 2:
        df_cont = df[cont_names].apply(pd.to_numeric, errors="coerce").dropna(how="all")
        pearson_matrix = df_cont.corr(method="pearson")
        spearman_matrix = df_cont.corr(method="spearman")
        variable_order = list(pearson_matrix.columns)
        for i, col_a in enumerate(variable_order):
            for j, col_b in enumerate(variable_order):
                if i <= j:
                    continue
                r = pearson_matrix.loc[col_a, col_b]
                rho = spearman_matrix.loc[col_a, col_b]
                if pd.isna(r):
                    continue
                rho_value = float(rho) if not pd.isna(rho) else np.nan
                entry = {
                    "col_a": col_a,
                    "display_a": _display_label(by_name[col_a]),
                    "col_b": col_b,
                    "display_b": _display_label(by_name[col_b]),
                }
                pearson_flat.append({**entry, "r": round(float(r), 4)})
                spearman_flat.append({**entry, "rho": round(rho_value, 4) if np.isfinite(rho_value) else None})
                if abs(float(r)) > corr_flag_threshold or (np.isfinite(rho_value) and abs(rho_value) > corr_flag_threshold):
                    flagged.append({
                        **entry,
                        "pearson_r": round(float(r), 4),
                        "spearman_rho": round(rho_value, 4) if np.isfinite(rho_value) else None,
                    })
    flagged.sort(key=lambda item: max(abs(item["pearson_r"]), abs(item["spearman_rho"] or 0)), reverse=True)

    bivariate = None
    if grouping_variable and grouping_variable in df.columns and df[grouping_variable].dropna().nunique() >= 2:
        group_label = _display_label(by_name.get(grouping_variable, {"name": grouping_variable}))
        plots = []
        for column in active_schema_cols:
            col_name = column["name"]
            col_type = column.get("confirmedType")
            if col_name == grouping_variable or col_name not in df.columns:
                continue
            png = None
            plot_type = None
            if col_type == "continuous":
                png = _render_boxplot(
                    df,
                    grouping_variable,
                    col_name,
                    _display_label(column),
                    group_label,
                    theme,
                    group_column=by_name.get(grouping_variable),
                )
                plot_type = "boxplot"
            elif col_type in CATEGORICAL_TYPES:
                png = _render_stacked_bar(
                    df,
                    grouping_variable,
                    col_name,
                    _display_label(column),
                    group_label,
                    theme,
                    value_column=column,
                )
                plot_type = "stacked_bar"
            if png and plot_type:
                plots.append({
                    "variable": col_name,
                    "display_label": _display_label(column),
                    "plot_type": plot_type,
                    "png": png,
                })
        bivariate = {
            "grouping_variable": grouping_variable,
            "grouping_display_label": group_label,
            "plots": plots,
        }

    return {
        "missingness": {
            "per_variable": per_variable,
            "indicator_correlations": indicator_correlations,
            "heatmap_png": heatmap_png,
            "mcar": _little_mcar_test(df, active_schema_cols),
        },
        "correlations": {
            "pearson": pearson_flat,
            "spearman": spearman_flat,
            "flagged": flagged,
            "n_continuous": len(cont_cols),
            "variable_order": variable_order,
        },
        "bivariate": bivariate,
        "mosaic": {
            "pairs": _compute_mosaic_pairs(df, categorical_cols, theme),
        },
        "vif": _compute_vif(df, cont_cols),
    }
