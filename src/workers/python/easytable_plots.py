import io
import json
import base64
import textwrap
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

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

def _coerce_plot_theme(plot_theme):
    if plot_theme is None:
        return dict(DEFAULT_PLOT_THEME)
    if isinstance(plot_theme, str):
        plot_theme = json.loads(plot_theme)
    theme = dict(DEFAULT_PLOT_THEME)
    theme.update(plot_theme)
    if theme["seaborn_style"] not in VALID_SEABORN_STYLES:
        raise ValueError(f"Invalid seaborn_style: {theme['seaborn_style']}")
    if len(theme.get("color_palette", [])) < 2:
        raise ValueError("plot_theme.color_palette must contain at least 2 colors")
    return theme

def _apply_plot_theme(plot_theme, dpi_key, dpi, font_scale=1.0):
    theme = _coerce_plot_theme(plot_theme)
    effective_dpi = dpi if dpi is not None else int(theme.get(dpi_key, DEFAULT_PLOT_THEME[dpi_key]))
    base_size = max(int(round(int(theme.get("font_size_base", DEFAULT_PLOT_THEME["font_size_base"])) * float(font_scale))), 1)
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
    return theme, effective_dpi

def _get_bytes(fig, dpi, tight=False, output_format="png"):
    if output_format not in {"png", "pdf", "svg"}:
        raise ValueError(f"Unsupported figure format: {output_format}")
    buf = io.BytesIO()
    save_kwargs = {"format": output_format, "dpi": dpi}
    if tight:
        save_kwargs["bbox_inches"] = "tight"
    fig.savefig(buf, **save_kwargs)
    buf.seek(0)
    b64_str = base64.b64encode(buf.read()).decode('utf-8')
    plt.close(fig)
    return b64_str

def _color_for_group(group_name, groups, palette):
    if group_name in groups:
        return palette[list(groups).index(group_name) % len(palette)]
    return palette[0]


def _facet_group_name(title_text):
    return title_text.split(" = ", 1)[1] if " = " in title_text else title_text


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

    Duplicated in easytable_eda.py because Pyodide injects these worker files as
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


def _wrap_title(title_text, width_in, base_size):
    approx_char_width_in = max(base_size, 6) / 72 * 0.7
    max_chars = max(18, int(width_in / max(approx_char_width_in, 0.01)))
    if len(title_text) <= max_chars:
        return title_text
    return "\n".join(textwrap.wrap(title_text, width=max_chars, max_lines=2, placeholder="..."))


def _collect_plot_debug(fig):
    fig.canvas.draw()
    axes = list(fig.axes)
    legends = [ax.get_legend() for ax in axes if ax.get_legend() is not None]
    legend_locs = list(getattr(fig, "_easytable_legend_locs", []))
    legend_locs.extend([legend._loc for legend in legends])
    return {
        "figsize": tuple(float(v) for v in fig.get_size_inches()),
        "titles": [ax.get_title() for ax in axes],
        "legend_locs": legend_locs,
        "x_tick_overlap": any(_ticklabel_overlap(fig, ax, "x") for ax in axes),
        "x_tick_rotations": [
            float(label.get_rotation())
            for ax in axes
            for label in ax.get_xticklabels()
            if label.get_visible() and label.get_text()
        ],
    }


def render_plot(data, plot_type, plot_theme, width_in, height_in, dpi, tight=False, output_format="png", _debug=False):
    """
    Core rendering dispatcher.
    """
    if isinstance(data, str):
        data = json.loads(data)

    theme = _coerce_plot_theme(plot_theme)
    base_size = int(theme.get("font_size_base", DEFAULT_PLOT_THEME["font_size_base"]))
    palette = theme.get("color_palette", DEFAULT_PLOT_THEME["color_palette"])
    bar_edge_color = theme.get("bar_edge_color", DEFAULT_PLOT_THEME["bar_edge_color"])
    bar_edge_linewidth = float(theme.get("bar_edge_linewidth", DEFAULT_PLOT_THEME["bar_edge_linewidth"]))
    line_width = float(theme.get("line_width", DEFAULT_PLOT_THEME["line_width"]))
    is_categorical = data.get("type") == "categorical"
    raw_df = pd.DataFrame(data.get("raw", []))
    
    if raw_df.empty:
        # Render a placeholder / empty plot
        fig, ax = plt.subplots(figsize=(width_in, height_in))
        ax.text(0.5, 0.5, "No data available", ha='center', va='center')
        ax.set_axis_off()
        return _get_bytes(fig, dpi, tight, output_format)

    unique_groups = raw_df["group"].unique() if "group" in raw_df.columns else []
    has_groups = len(unique_groups) > 1

    if plot_type == 'histogram':
        if has_groups:
            g = sns.FacetGrid(raw_df, col="group", height=height_in, aspect=width_in/height_in, sharey=True)
            def plot_hist_facet(data, **kwargs):
                group_name = data["group"].iloc[0]
                sns.histplot(
                    data=data,
                    x="val",
                    bins=20,
                    stat="density",
                    kde=True,
                    color=_color_for_group(group_name, unique_groups, palette),
                    edgecolor=bar_edge_color,
                    linewidth=bar_edge_linewidth,
                )
            g.map_dataframe(plot_hist_facet)
            g.set_axis_labels("Value", "Density")
            g.set_titles("{col_name}")
            for ax in g.axes.flat:
                title_text = ax.get_title()
                group_name = _facet_group_name(title_text)
                n_count = len(raw_df[raw_df["group"] == group_name])
                ax.set_title(_wrap_title(f"{group_name} (n={n_count})", width_in, base_size))
            fig = g.fig
        else:
            fig, ax = plt.subplots(figsize=(width_in, height_in))
            sns.histplot(
                data=raw_df,
                x="val",
                bins=20,
                stat="density",
                kde=True,
                color=palette[0],
                edgecolor=bar_edge_color,
                linewidth=bar_edge_linewidth,
                ax=ax
            )
            ax.set_xlabel("Value")
            ax.set_ylabel("Density")
            n_count = len(raw_df)
            ax.set_title(_wrap_title(f"All (n={n_count})", width_in, base_size))
            fig.tight_layout()

    elif plot_type == 'qqplot':
        qq_data = data.get("qq", {})
        qq_pts = pd.DataFrame(qq_data.get("points", []))
        qq_lines = pd.DataFrame(qq_data.get("lines", []))
        variable_label = data.get("display_label") or data.get("variable", "Variable")
        
        if qq_pts.empty:
            fig, ax = plt.subplots(figsize=(width_in, height_in))
            ax.text(0.5, 0.5, "Q-Q Plot: Insufficient continuous data", ha='center', va='center')
            ax.set_axis_off()
            return _get_bytes(fig, dpi, tight, output_format)

        if has_groups:
            g = sns.FacetGrid(qq_pts, col="group", height=height_in, aspect=width_in/height_in, sharey=False)
            
            def plot_qq_facet(data, **kwargs):
                group_name = data["group"].iloc[0]
                plt.scatter(
                    data["theoretical"],
                    data["sample"],
                    alpha=0.6,
                    color=_color_for_group(group_name, unique_groups, palette),
                    edgecolor="none",
                    s=30,
                    label="Observed"
                )
                line_sub = qq_lines[qq_lines["group"] == group_name] if not qq_lines.empty else []
                if len(line_sub) > 0:
                    plt.plot(
                        line_sub["x"],
                        line_sub["y"],
                        color=palette[1 % len(palette)],
                        linestyle="--",
                        linewidth=line_width,
                        label="Reference Line"
                    )
                legend = plt.gca().legend(loc="best", frameon=True, fontsize=max(base_size - 1, 6))
                fig = plt.gcf()
                if not hasattr(fig, "_easytable_legend_locs"):
                    fig._easytable_legend_locs = []
                fig._easytable_legend_locs.append(legend._loc)
                
            g.map_dataframe(plot_qq_facet)
            g.set_axis_labels("Theoretical Quantiles (Normal)", "Sample Quantiles")
            for ax in g.axes.flat:
                title_text = ax.get_title()
                group_name = _facet_group_name(title_text)
                ax.set_title(_wrap_title(f"Q-Q Plot: {variable_label} - {group_name}", width_in, base_size))
            fig = g.fig
        else:
            fig, ax = plt.subplots(figsize=(width_in, height_in))
            ax.scatter(
                qq_pts["theoretical"],
                qq_pts["sample"],
                alpha=0.6,
                color=palette[0],
                edgecolor="none",
                s=30,
                label="Observed"
            )
            if not qq_lines.empty and len(qq_lines) > 0:
                ax.plot(
                    qq_lines["x"],
                    qq_lines["y"],
                    color=palette[1 % len(palette)],
                    linestyle="--",
                    linewidth=line_width,
                    label="Reference Line"
                )
            ax.set_xlabel("Theoretical Quantiles (Normal)")
            ax.set_ylabel("Sample Quantiles")
            ax.set_title(_wrap_title(f"Q-Q Plot: {variable_label}", width_in, base_size))
            ax.legend(loc="best", frameon=True, fontsize=max(base_size - 1, 6))
            fig.tight_layout()

    elif plot_type == 'barchart':
        fig, ax = plt.subplots(figsize=(width_in, height_in))
        if has_groups:
            sns.countplot(
                data=raw_df,
                x="val",
                hue="group",
                palette=palette,
                edgecolor=bar_edge_color,
                linewidth=bar_edge_linewidth,
                ax=ax
            )
        else:
            sns.countplot(
                data=raw_df,
                x="val",
                color=palette[0],
                edgecolor=bar_edge_color,
                linewidth=bar_edge_linewidth,
                ax=ax
            )
        ax.set_xlabel("Category")
        ax.set_ylabel("Count")
        _fit_categorical_axis_labels(fig, ax, axis="x", min_width_in=width_in, max_width_in=8.0)
        fig.tight_layout()
        _fit_categorical_axis_labels(fig, ax, axis="x", min_width_in=width_in, max_width_in=8.0)

    elif plot_type == 'boxplot':
        fig, ax = plt.subplots(figsize=(width_in, height_in))
        if has_groups:
            sns.boxplot(
                data=raw_df,
                x="group",
                y="val",
                palette=palette,
                hue="group",
                legend=False,
                width=0.4,
                fliersize=5,
                flierprops={"markerfacecolor": palette[1 % len(palette)], "markeredgecolor": "none"},
                linewidth=line_width,
                ax=ax
            )
        else:
            sns.boxplot(
                data=raw_df,
                y="val",
                color=palette[0],
                width=0.4,
                fliersize=5,
                flierprops={"markerfacecolor": palette[1 % len(palette)], "markeredgecolor": "none"},
                linewidth=line_width,
                ax=ax
            )
        ax.set_xlabel("Group" if has_groups else "")
        ax.set_ylabel("Value")
        if has_groups:
            _fit_categorical_axis_labels(fig, ax, axis="x", min_width_in=width_in, max_width_in=8.0)
        fig.tight_layout()
        if has_groups:
            _fit_categorical_axis_labels(fig, ax, axis="x", min_width_in=width_in, max_width_in=8.0)
        
    else:
        raise ValueError(f"Unknown plot_type: {plot_type}")

    if theme.get("despine", True):
        sns.despine(fig=fig)
    if _debug:
        debug = _collect_plot_debug(fig)
        plt.close(fig)
        return debug
    return _get_bytes(fig, dpi, tight, output_format)

def render_thumbnail(data, plot_type, plot_theme=None, width_in=3.0, height_in=2.0, dpi=None):
    if isinstance(plot_theme, (int, float)):
        old_width_in = plot_theme
        old_height_in = width_in
        old_dpi = height_in
        plot_theme = None
        width_in = old_width_in
        height_in = old_height_in
        dpi = old_dpi
    theme, effective_dpi = _apply_plot_theme(plot_theme, "figure_dpi_screen", dpi)
    return render_plot(data, plot_type, theme, width_in, height_in, effective_dpi, tight=False)

def render_publication_figure(data, plot_type, plot_theme=None, width_in=6.0, height_in=4.0, dpi=None, output_format="png", font_scale=1.0):
    if isinstance(plot_theme, (int, float)):
        old_width_in = plot_theme
        old_height_in = width_in
        old_dpi = height_in
        plot_theme = None
        width_in = old_width_in
        height_in = old_height_in
        dpi = old_dpi
    theme, effective_dpi = _apply_plot_theme(plot_theme, "figure_dpi_export", dpi, font_scale)
    return render_plot(data, plot_type, theme, width_in, height_in, effective_dpi, tight=True, output_format=output_format)
