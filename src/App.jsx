import { useState, useCallback, useMemo } from "react";
import {
    ComposableMap,
    Geographies,
    Geography,
    ZoomableGroup,
} from "react-simple-maps";
import { scaleQuantize, scaleLinear } from "d3-scale";
import {
    Segmented,
    Table,
    ConfigProvider,
    theme,
    Card,
    Descriptions,
    Statistic,
    Divider,
    Tag,
    Button,
    Badge,
} from "antd";
import rawData from "./data/strain_2024.json";
import whatifData from "./data/whatif_2024.json";
import bestActionData from "./data/best_action_2024.json";
import allocationsData from "./data/allocations_2024_rf.json";
import afterData from "./data/strain_2024_rf_after.json";

// ─── TopoJSON URL ────────────────────────────────────────────────────────────
const GEO_URL =
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// ─── Map mode options ─────────────────────────────────────────────────────────
const MAP_MODES = [
    { key: "computed", label: "Computed Strain (2024)" },
    { key: "pred_before", label: "Model Prediction Before" },
    { key: "pred_after", label: "Model Prediction after" },
    { key: "delta", label: "Delta (After − Before)" },
];

// ─── Color Scales ─────────────────────────────────────────────────────────────
const COLOR_RANGE = [
    "#1a3a5c", "#1e4d7b", "#1a6290", "#1478a0",
    "#1b90b0", "#34a9c2", "#5cbecf", "#91d3d9",
    "#f5a623", "#f87421", "#f85149",
];
// For delta: negative = improvement (green), positive = worsening (red)
const COLOR_RANGE_DELTA_NEG = [
    "#0d4f2f", "#1a7a3f", "#2fa84e", "#5dc46b", "#a3dba8",
];
const COLOR_RANGE_DELTA_POS = [
    "#f5c89a", "#f5a623", "#f87421", "#f85149", "#c0392b",
];
const COLOR_NO_DATA = "#2a3139";
const COLOR_STROKE = "#0d1117";

// ─── Alias map: TopoJSON name → iso3 ─────────────────────────────────────────
const GEO_NAME_ALIASES = {
    "united states of america": "USA",
    "russian federation": "RUS",
    "russia": "RUS",
    "united kingdom": "GBR",
    "south korea": "KOR",
    "republic of korea": "KOR",
    "korea, republic of": "KOR",
    "iran": "IRN",
    "iran (islamic republic of)": "IRN",
    "syria": "SYR",
    "syrian arab republic": "SYR",
    "vietnam": "VNM",
    "viet nam": "VNM",
    "bolivia": "BOL",
    "bolivia (plurinational state of)": "BOL",
    "venezuela": "VEN",
    "venezuela (bolivarian republic of)": "VEN",
    "tanzania, united republic of": "TZA",
    "tanzania": "TZA",
    "democratic republic of the congo": "COD",
    "congo, the democratic republic of the": "COD",
    "republic of the congo": "COG",
    "laos": "LAO",
    "lao people's democratic republic": "LAO",
    "north korea": "PRK",
    "czech republic": "CZE",
    "czechia": "CZE",
    "taiwan": "TWN",
    "taiwan, province of china": "TWN",
    "moldova, republic of": "MDA",
    "moldova": "MDA",
    "korea": "KOR",
};

// ─── Build lookup tables ───────────────────────────────────────────────────────
// nameToIso3: lowercase country name → iso3
const nameToIso3 = {};
rawData.forEach((d) => {
    nameToIso3[d.country.toLowerCase()] = d.iso3;
});

const whatifByIso3 = Object.fromEntries(whatifData.map((d) => [d.iso3, d]));
const bestActionByIso3 = Object.fromEntries(bestActionData.map((d) => [d.iso3, d]));
const afterByIso3 = Object.fromEntries(afterData.map((d) => [d.iso3, d]));
const computedByIso3 = Object.fromEntries(rawData.map((d) => [d.iso3, d]));

// mergedByIso3: one combined object per iso3
const mergedByIso3 = {};
const allIso3s = new Set([
    ...Object.keys(computedByIso3),
    ...Object.keys(whatifByIso3),
    ...Object.keys(bestActionByIso3),
    ...Object.keys(afterByIso3),
]);
allIso3s.forEach((iso3) => {
    const comp = computedByIso3[iso3] ?? {};
    const wi = whatifByIso3[iso3] ?? {};
    const ba = bestActionByIso3[iso3] ?? {};
    const af = afterByIso3[iso3] ?? {};
    mergedByIso3[iso3] = {
        iso3,
        country: comp.country ?? wi.country ?? ba.country ?? af.country ?? iso3,
        // Computed
        strain_index: comp.strain_index,
        burden_score: comp.burden_score,
        capacity_gap: comp.capacity_gap,
        affordability_gap: comp.affordability_gap,
        // Predicted
        pred_strain_base: wi.pred_strain_base ?? af.pred_strain_before,
        pred_strain_before: af.pred_strain_before ?? wi.pred_strain_base,
        pred_strain_after: af.pred_strain_after,
        delta_pred_strain_after: af.delta_pred_strain,
        // What-if
        pred_strain_if_access: wi.pred_strain_if_access,
        delta_access: wi.delta_access,
        pred_strain_if_doctors: wi.pred_strain_if_doctors,
        delta_doctors: wi.delta_doctors,
        pred_strain_if_beds: wi.pred_strain_if_beds,
        delta_beds: wi.delta_beds,
        // Best action
        best_lever: ba.best_lever,
        roi: ba.roi,
        best_cost: ba.cost,
        delta_pred_strain_best: ba.delta_pred_strain,
        // After allocation
        access_final: af.access_final,
        doctors_final: af.doctors_final,
        beds_final: af.beds_final,
    };
});

// ─── Helper: resolve iso3 from geo properties.name ───────────────────────────
function resolveIso3FromGeoName(geoName) {
    if (!geoName) return null;
    const lower = geoName.toLowerCase().trim();
    // Check alias map first
    if (GEO_NAME_ALIASES[lower]) return GEO_NAME_ALIASES[lower];
    // Check our data's nameToIso3
    if (nameToIso3[lower]) return nameToIso3[lower];
    return null;
}

// ─── Metric value getter ─────────────────────────────────────────────────────
function getMetricValue(iso3, mapMode) {
    const d = mergedByIso3[iso3];
    if (!d) return null;
    if (mapMode === "computed") return d.strain_index ?? null;
    if (mapMode === "pred_before") return d.pred_strain_before ?? d.pred_strain_base ?? null;
    if (mapMode === "pred_after") return d.pred_strain_after ?? null;
    if (mapMode === "delta") {
        const before = d.pred_strain_before ?? d.pred_strain_base;
        const after = d.pred_strain_after;
        if (before == null || after == null) return null;
        return after - before; // negative = improvement
    }
    return null;
}

// ─── Build color scale per mode ───────────────────────────────────────────────
function buildColorScale(mapMode) {
    const vals = Object.values(mergedByIso3)
        .map((d) => getMetricValue(d.iso3, mapMode))
        .filter((v) => v != null);
    if (vals.length === 0) return () => COLOR_NO_DATA;

    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);

    if (mapMode === "delta") {
        // Split scale: negative values green, positive red
        const negVals = vals.filter((v) => v < 0);
        const posVals = vals.filter((v) => v > 0);
        const negScale = negVals.length > 0
            ? scaleQuantize().domain([Math.min(...negVals), 0]).range(COLOR_RANGE_DELTA_NEG)
            : null;
        const posScale = posVals.length > 0
            ? scaleQuantize().domain([0, Math.max(...posVals)]).range(COLOR_RANGE_DELTA_POS)
            : null;
        return (val) => {
            if (val == null) return COLOR_NO_DATA;
            if (val < 0 && negScale) return negScale(val);
            if (val > 0 && posScale) return posScale(val);
            return "#91d3d9"; // zero
        };
    }

    return scaleQuantize().domain([minVal, maxVal]).range(COLOR_RANGE);
}

// ─── Formatting helpers ───────────────────────────────────────────────────────
const fmt3 = (v) => (v != null ? v.toFixed(3) : "—");
const fmt4 = (v) => (v != null ? v.toFixed(4) : "—");
const fmtDelta = (v) => {
    if (v == null) return "—";
    const sign = v < 0 ? "" : "+";
    return `${sign}${v.toFixed(4)}`;
};
const fmtCost = (v) => {
    if (v == null) return "—";
    return "$" + Math.round(v).toLocaleString("en-US");
};
const fmtROI = (v) => {
    if (v == null) return "—";
    return v.toExponential(2);
};

const MODE_LABELS = {
    computed: "Computed Strain Index",
    pred_before: "Model Prediction Before",
    pred_after: "Model Prediction after",
    delta: "Delta (After − Before)",
};

// ─── Top 10 Table ─────────────────────────────────────────────────────────────
function Top10Table({ mapMode, onSelectCountry }) {
    const sorted = useMemo(() => {
        return Object.values(mergedByIso3)
            .map((d) => ({ ...d, _val: getMetricValue(d.iso3, mapMode) }))
            .filter((d) => d._val != null)
            .sort((a, b) => {
                // For delta: most-negative (most improved) first
                if (mapMode === "delta") return a._val - b._val;
                return b._val - a._val;
            })
            .slice(0, 10);
    }, [mapMode]);

    const maxAbsVal = Math.max(...sorted.map((d) => Math.abs(d._val)), 1);

    const columns = [
        {
            title: "#",
            key: "rank",
            width: 36,
            render: (_, __, idx) => (
                <span className={`rank-badge ${idx < 3 ? "top3" : ""}`}>
                    {idx + 1}
                </span>
            ),
        },
        {
            title: "Country",
            dataIndex: "country",
            key: "country",
            ellipsis: true,
            render: (text) => (
                <span style={{ fontSize: 12, fontWeight: 500 }}>{text}</span>
            ),
        },
        {
            title: "Value",
            key: "value",
            width: 120,
            render: (_, row) => {
                const val = row._val;
                const pct = (Math.abs(val) / maxAbsVal) * 100;
                let color;
                if (mapMode === "delta") {
                    color = val < 0 ? "#2fa84e" : "#f85149";
                } else {
                    color = pct > 75 ? "#f85149" : pct > 55 ? "#f5a623" : pct > 35 ? "#34a9c2" : "#1e4d7b";
                }
                return (
                    <div className="value-bar-wrapper">
                        <div className="value-bar-bg">
                            <div
                                className="value-bar-fill"
                                style={{ width: `${pct}%`, background: color }}
                            />
                        </div>
                        <span className="value-text">{fmt3(val)}</span>
                    </div>
                );
            },
        },
    ];

    return (
        <Table
            dataSource={sorted.map((d) => ({ ...d, key: d.iso3 }))}
            columns={columns}
            pagination={false}
            size="small"
            style={{ background: "transparent" }}
            onRow={(row) => ({
                onClick: () => onSelectCountry(row.iso3),
                style: { cursor: "pointer" },
            })}
        />
    );
}

// ─── Country Detail Card ──────────────────────────────────────────────────────
function CountryDetail({ iso3, onClose }) {
    const d = mergedByIso3[iso3];
    if (!d) return (
        <div style={{ padding: 16, color: "var(--text-muted)" }}>
            No data available for this country.
        </div>
    );

    const deltaAfterBefore = d.pred_strain_after != null && d.pred_strain_before != null
        ? d.pred_strain_after - d.pred_strain_before
        : null;

    const leverColors = { Access: "#34a9c2", Doctors: "#f5a623", Beds: "#5cbecf" };
    const leverColor = leverColors[d.best_lever] ?? "#888";

    return (
        <div style={{ padding: "0 4px" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                        {d.country}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
                        {d.iso3}
                    </div>
                </div>
                <Button
                    size="small"
                    type="text"
                    onClick={onClose}
                    style={{ color: "var(--text-muted)", fontSize: 16 }}
                >
                    ✕
                </Button>
            </div>

            {/* Computed Strain */}
            <div style={{ marginBottom: 12 }}>
                <div className="detail-section-label">Computed Strain (2024)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
                    <Statistic
                        title="Strain Index"
                        value={d.strain_index != null ? fmt3(d.strain_index) : "—"}
                        valueStyle={{ fontSize: 18, color: "#f85149" }}
                    />
                    <Statistic
                        title="Burden Score"
                        value={d.burden_score != null ? fmt3(d.burden_score) : "—"}
                        valueStyle={{ fontSize: 18, color: "#f5a623" }}
                    />
                    <Statistic
                        title="Capacity Gap"
                        value={d.capacity_gap != null ? fmt3(d.capacity_gap) : "—"}
                        valueStyle={{ fontSize: 15, color: "#34a9c2" }}
                    />
                    <Statistic
                        title="Affordability Gap"
                        value={d.affordability_gap != null ? fmt3(d.affordability_gap) : "—"}
                        valueStyle={{ fontSize: 15, color: "#5cbecf" }}
                    />
                </div>
            </div>

            <Divider style={{ margin: "10px 0", borderColor: "rgba(255,255,255,0.08)" }} />

            {/* Predicted Strain */}
            <div style={{ marginBottom: 12 }}>
                <div className="detail-section-label">Predicted Strain</div>
                <Descriptions
                    size="small"
                    column={1}
                    labelStyle={{ color: "var(--text-muted)", fontSize: 11 }}
                    contentStyle={{ color: "var(--text-primary)", fontSize: 12, fontWeight: 600 }}
                    style={{ marginTop: 6 }}
                >
                    <Descriptions.Item label="Base / Before">
                        {fmt4(d.pred_strain_before ?? d.pred_strain_base)}
                    </Descriptions.Item>
                    <Descriptions.Item label="After Allocation">
                        {fmt4(d.pred_strain_after)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Δ (After − Before)">
                        <span style={{ color: deltaAfterBefore != null && deltaAfterBefore < 0 ? "#2fa84e" : "#f85149" }}>
                            {fmtDelta(deltaAfterBefore)}
                        </span>
                    </Descriptions.Item>
                </Descriptions>
            </div>

            <Divider style={{ margin: "10px 0", borderColor: "rgba(255,255,255,0.08)" }} />

            {/* What-If Deltas */}
            {(d.delta_access != null || d.delta_doctors != null || d.delta_beds != null) && (
                <>
                    <div style={{ marginBottom: 12 }}>
                        <div className="detail-section-label">What-If Improvements</div>
                        <Descriptions
                            size="small"
                            column={1}
                            labelStyle={{ color: "var(--text-muted)", fontSize: 11 }}
                            contentStyle={{ color: "var(--text-primary)", fontSize: 12 }}
                            style={{ marginTop: 6 }}
                        >
                            {d.delta_access != null && (
                                <Descriptions.Item label="If Access ↑ (strain)">
                                    <span>{fmt4(d.pred_strain_if_access)}</span>
                                    <span style={{ marginLeft: 6, color: "#34a9c2", fontSize: 11 }}>
                                        (saves {fmt4(d.delta_access)})
                                    </span>
                                </Descriptions.Item>
                            )}
                            {d.delta_doctors != null && (
                                <Descriptions.Item label="If Doctors ↑ (strain)">
                                    <span>{fmt4(d.pred_strain_if_doctors)}</span>
                                    <span style={{ marginLeft: 6, color: "#f5a623", fontSize: 11 }}>
                                        (saves {fmt4(d.delta_doctors)})
                                    </span>
                                </Descriptions.Item>
                            )}
                            {d.delta_beds != null && (
                                <Descriptions.Item label="If Beds ↑ (strain)">
                                    <span>{fmt4(d.pred_strain_if_beds)}</span>
                                    <span style={{ marginLeft: 6, color: "#5cbecf", fontSize: 11 }}>
                                        (saves {fmt4(d.delta_beds)})
                                    </span>
                                </Descriptions.Item>
                            )}
                        </Descriptions>
                    </div>
                    <Divider style={{ margin: "10px 0", borderColor: "rgba(255,255,255,0.08)" }} />
                </>
            )}

            {/* Best Action */}
            {d.best_lever && (
                <>
                    <div style={{ marginBottom: 12 }}>
                        <div className="detail-section-label">Best Action</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0 6px" }}>
                            <Tag color={leverColor} style={{ fontWeight: 700, fontSize: 12 }}>
                                {d.best_lever}
                            </Tag>
                            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>best lever</span>
                        </div>
                        <Descriptions
                            size="small"
                            column={1}
                            labelStyle={{ color: "var(--text-muted)", fontSize: 11 }}
                            contentStyle={{ color: "var(--text-primary)", fontSize: 12 }}
                        >
                            <Descriptions.Item label="Cost">{fmtCost(d.best_cost)}</Descriptions.Item>
                            <Descriptions.Item label="ROI">{fmtROI(d.roi)}</Descriptions.Item>
                            <Descriptions.Item label="Strain Improvement">{fmt4(d.delta_pred_strain_best)}</Descriptions.Item>
                        </Descriptions>
                    </div>
                    <Divider style={{ margin: "10px 0", borderColor: "rgba(255,255,255,0.08)" }} />
                </>
            )}

        </div>
    );
}

// ─── Allocations Table ────────────────────────────────────────────────────────
function AllocationsTable({ onSelectCountry }) {
    const totalSpend = useMemo(
        () => allocationsData.reduce((s, r) => s + (r.cost ?? 0), 0),
        []
    );
    const lastRemaining = allocationsData[allocationsData.length - 1]?.remaining_budget ?? 0;

    // Top 5 countries by total spend
    const spendByIso3 = useMemo(() => {
        const acc = {};
        allocationsData.forEach((r) => {
            if (!acc[r.iso3]) acc[r.iso3] = { iso3: r.iso3, country: r.country, total: 0 };
            acc[r.iso3].total += r.cost ?? 0;
        });
        return Object.values(acc).sort((a, b) => b.total - a.total).slice(0, 5);
    }, []);

    const columns = [
        {
            title: "#",
            dataIndex: "iteration",
            key: "iteration",
            width: 44,
            sorter: (a, b) => a.iteration - b.iteration,
            defaultSortOrder: "ascend",
            render: (v) => <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{v}</span>,
        },
        {
            title: "Country",
            dataIndex: "country",
            key: "country",
            ellipsis: true,
            sorter: (a, b) => a.country.localeCompare(b.country),
            render: (text) => <span style={{ fontSize: 12, fontWeight: 500 }}>{text}</span>,
        },
        {
            title: "Lever",
            dataIndex: "lever",
            key: "lever",
            width: 72,
            sorter: (a, b) => a.lever.localeCompare(b.lever),
            render: (v) => {
                const colors = { Access: "#34a9c2", Doctors: "#f5a623", Beds: "#5cbecf" };
                return <Tag color={colors[v] ?? "#888"} style={{ fontSize: 10, padding: "0 4px" }}>{v}</Tag>;
            },
        },
        {
            title: "Cost",
            dataIndex: "cost",
            key: "cost",
            width: 110,
            sorter: (a, b) => a.cost - b.cost,
            render: (v) => <span style={{ fontSize: 11 }}>{fmtCost(v)}</span>,
        },
        {
            title: "Δ Strain",
            dataIndex: "delta_pred_strain",
            key: "delta_pred_strain",
            width: 80,
            sorter: (a, b) => b.delta_pred_strain - a.delta_pred_strain,
            render: (v) => (
                <span style={{ color: "#2fa84e", fontSize: 11, fontWeight: 600 }}>
                    −{v?.toFixed(4) ?? "—"}
                </span>
            ),
        },
        {
            title: "Remaining",
            dataIndex: "remaining_budget",
            key: "remaining_budget",
            width: 110,
            sorter: (a, b) => a.remaining_budget - b.remaining_budget,
            render: (v) => <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtCost(v)}</span>,
        },
    ];

    return (
        <div>
            {/* Summary */}
            <div className="alloc-summary">
                <div className="alloc-stat">
                    <div className="alloc-stat-label">Total Spent</div>
                    <div className="alloc-stat-value">{fmtCost(totalSpend)}</div>
                </div>
                <div className="alloc-stat">
                    <div className="alloc-stat-label">Remaining Budget</div>
                    <div className="alloc-stat-value">{fmtCost(lastRemaining)}</div>
                </div>
                <div className="alloc-stat">
                    <div className="alloc-stat-label">Iterations</div>
                    <div className="alloc-stat-value">{allocationsData.length}</div>
                </div>
            </div>

            {/* Top 5 recipients */}
            <div className="alloc-top5">
                <span style={{ color: "var(--text-muted)", fontSize: 11, marginRight: 8 }}>
                    Top recipients:
                </span>
                {spendByIso3.map((s, i) => (
                    <span
                        key={s.iso3}
                        className="alloc-top5-item"
                        onClick={() => onSelectCountry(s.iso3)}
                    >
                        <Badge count={i + 1} size="small" color="#1b90b0" />
                        <span style={{ marginLeft: 4 }}>{s.country}</span>
                        <span style={{ color: "var(--text-muted)", marginLeft: 4, fontSize: 10 }}>
                            ({fmtCost(s.total)})
                        </span>
                    </span>
                ))}
            </div>

            <Table
                dataSource={allocationsData.map((d) => ({ ...d, key: d.iteration }))}
                columns={columns}
                pagination={{ pageSize: 15, size: "small", showSizeChanger: false }}
                size="small"
                style={{ background: "transparent" }}
                onRow={(row) => ({
                    onClick: () => onSelectCountry(row.iso3),
                    style: { cursor: "pointer" },
                })}
            />
        </div>
    );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
function Tooltip({ visible, x, y, iso3, geoName, mapMode }) {
    if (!visible) return null;

    const style = {
        left: x + 14,
        top: y - 10,
        ...(x > window.innerWidth - 240 ? { left: x - 214 } : {}),
    };

    const d = iso3 ? mergedByIso3[iso3] : null;
    const val = iso3 ? getMetricValue(iso3, mapMode) : null;

    if (!d || val == null) {
        return (
            <div className="tooltip" style={style}>
                <div className="tooltip-country">{geoName ?? "No Data"}</div>
                <div className="tooltip-no-data">No data for this country.</div>
            </div>
        );
    }

    const modeLabel = MODE_LABELS[mapMode] ?? mapMode;

    return (
        <div className="tooltip" style={style}>
            <div className="tooltip-country">{d.country}</div>
            <div className="tooltip-row">
                <span className="tooltip-metric-name">{modeLabel}</span>
                <span className="tooltip-metric-value highlighted">{fmt4(val)}</span>
            </div>
            {/* Show all 4 computed sub-metrics when in computed mode */}
            {mapMode === "computed" && (
                <>
                    {d.burden_score != null && (
                        <div className="tooltip-row">
                            <span className="tooltip-metric-name">Burden Score</span>
                            <span className="tooltip-metric-value">{fmt4(d.burden_score)}</span>
                        </div>
                    )}
                    {d.capacity_gap != null && (
                        <div className="tooltip-row">
                            <span className="tooltip-metric-name">Capacity Gap</span>
                            <span className="tooltip-metric-value">{fmt4(d.capacity_gap)}</span>
                        </div>
                    )}
                    {d.affordability_gap != null && (
                        <div className="tooltip-row">
                            <span className="tooltip-metric-name">Afford. Gap</span>
                            <span className="tooltip-metric-value">{fmt4(d.affordability_gap)}</span>
                        </div>
                    )}
                </>
            )}
            {mapMode === "delta" && d.pred_strain_before != null && d.pred_strain_after != null && (
                <>
                    <div className="tooltip-row">
                        <span className="tooltip-metric-name">Before</span>
                        <span className="tooltip-metric-value">{fmt4(d.pred_strain_before)}</span>
                    </div>
                    <div className="tooltip-row">
                        <span className="tooltip-metric-name">After</span>
                        <span className="tooltip-metric-value">{fmt4(d.pred_strain_after)}</span>
                    </div>
                </>
            )}
            {d.best_lever && (
                <div className="tooltip-row" style={{ marginTop: 4 }}>
                    <span className="tooltip-metric-name">Best lever</span>
                    <span className="tooltip-metric-value" style={{ color: "#34a9c2" }}>{d.best_lever}</span>
                </div>
            )}
        </div>
    );
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function Legend({ mapMode }) {
    const vals = Object.values(mergedByIso3)
        .map((d) => getMetricValue(d.iso3, mapMode))
        .filter((v) => v != null);
    const minVal = vals.length ? Math.min(...vals) : 0;
    const maxVal = vals.length ? Math.max(...vals) : 1;

    const label = MODE_LABELS[mapMode] ?? mapMode;

    return (
        <div className="legend-bar">
            {mapMode === "delta" ? (
                <>
                    <span className="legend-label" style={{ color: "#2fa84e" }}>Improved</span>
                    <div className="legend-gradient legend-gradient-delta" />
                    <span className="legend-label" style={{ color: "#f85149" }}>Worsened</span>
                </>
            ) : (
                <>
                    <span className="legend-label">Low</span>
                    <div className="legend-gradient" />
                    <span className="legend-label">High</span>
                </>
            )}
            <span className="legend-label" style={{ marginLeft: 12, color: "var(--text-muted)" }}>
                {label}: {minVal.toFixed(3)} → {maxVal.toFixed(3)}
            </span>
        </div>
    );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
    const [mapMode, setMapMode] = useState("computed");
    const [selectedIso3, setSelectedIso3] = useState(null);
    const [showAllocations, setShowAllocations] = useState(false);
    const [tooltip, setTooltip] = useState({
        visible: false, x: 0, y: 0, iso3: null, geoName: null,
    });

    const colorScale = useMemo(() => buildColorScale(mapMode), [mapMode]);

    const getFillColor = useCallback((geo) => {
        const iso3 = resolveIso3FromGeoName(geo.properties.name);
        if (!iso3) return COLOR_NO_DATA;
        const val = getMetricValue(iso3, mapMode);
        if (val == null) return COLOR_NO_DATA;
        return colorScale(val);
    }, [colorScale, mapMode]);

    const handleMouseEnter = useCallback((geo, e) => {
        const iso3 = resolveIso3FromGeoName(geo.properties.name);
        setTooltip({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            iso3: iso3 ?? null,
            geoName: geo.properties.name ?? "Unknown",
        });
    }, []);

    const handleMouseMove = useCallback((e) => {
        setTooltip((prev) => ({ ...prev, x: e.clientX, y: e.clientY }));
    }, []);

    const handleMouseLeave = useCallback(() => {
        setTooltip((prev) => ({ ...prev, visible: false }));
    }, []);

    const handleGeoClick = useCallback((geo) => {
        const iso3 = resolveIso3FromGeoName(geo.properties.name);
        if (iso3 && mergedByIso3[iso3]) {
            setSelectedIso3(iso3);
            setShowAllocations(false);
        }
    }, []);

    const handleSelectCountry = useCallback((iso3) => {
        setSelectedIso3(iso3);
        setShowAllocations(false);
    }, []);

    const handleClearSelection = useCallback(() => {
        setSelectedIso3(null);
    }, []);

    return (
        <ConfigProvider
            theme={{
                algorithm: theme.darkAlgorithm,
                token: {
                    colorBgContainer: "transparent",
                    colorBorder: "rgba(255,255,255,0.08)",
                    fontFamily: "Inter, sans-serif",
                },
            }}
        >
            <div className="dashboard">
                {/* ── Top Bar ── */}
                <div className="top-bar">
                    <div className="top-bar-title">
                        <h1>🌍 Global Health Strain Index 2024</h1>
                        <span>Click a country on the map or table for details</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                        <Segmented
                            value={mapMode}
                            onChange={(v) => { setMapMode(v); setSelectedIso3(null); }}
                            options={MAP_MODES.map(({ key, label }) => ({ label, value: key }))}
                            style={{ flexShrink: 0 }}
                        />
                        <Button
                            size="small"
                            type={showAllocations ? "primary" : "default"}
                            onClick={() => setShowAllocations((v) => !v)}
                            style={{ fontSize: 12 }}
                        >
                            💰 $100M Allocation Plan
                        </Button>
                    </div>
                </div>

                {/* ── Main Content ── */}
                <div className="main-content">
                    {/* ── Map ── */}
                    <div className="map-area">
                        <div className="map-container" onMouseMove={handleMouseMove}>
                            <ComposableMap
                                projection="geoNaturalEarth1"
                                style={{ width: "100%", height: "100%" }}
                            >
                                <ZoomableGroup zoom={1} center={[0, 0]}>
                                    <Geographies geography={GEO_URL}>
                                        {({ geographies }) =>
                                            geographies.map((geo) => {
                                                const iso3 = resolveIso3FromGeoName(geo.properties.name);
                                                const isSelected = iso3 && iso3 === selectedIso3;
                                                return (
                                                    <Geography
                                                        key={geo.rsmKey}
                                                        geography={geo}
                                                        fill={getFillColor(geo)}
                                                        stroke={isSelected ? "#ffffff" : COLOR_STROKE}
                                                        strokeWidth={isSelected ? 1.5 : 0.4}
                                                        onMouseEnter={(e) => handleMouseEnter(geo, e)}
                                                        onMouseLeave={handleMouseLeave}
                                                        onClick={() => handleGeoClick(geo)}
                                                        style={{
                                                            default: { outline: "none" },
                                                            hover: {
                                                                outline: "none",
                                                                opacity: 0.85,
                                                                filter: "brightness(1.2)",
                                                                cursor: "pointer",
                                                            },
                                                            pressed: { outline: "none" },
                                                        }}
                                                    />
                                                );
                                            })
                                        }
                                    </Geographies>
                                </ZoomableGroup>
                            </ComposableMap>
                        </div>
                        <Legend mapMode={mapMode} />
                    </div>

                    {/* ── Side Panel ── */}
                    <div className="side-panel">
                        {selectedIso3 ? (
                            <>
                                <div className="side-panel-header">
                                    <h2>Country Detail</h2>
                                </div>
                                <div className="side-panel-table">
                                    <CountryDetail
                                        iso3={selectedIso3}
                                        onClose={handleClearSelection}
                                    />
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="side-panel-header">
                                    <h2>Top 10 Countries</h2>
                                    <p>Ranked by {MODE_LABELS[mapMode]}</p>
                                </div>
                                <div className="side-panel-table">
                                    <Top10Table
                                        mapMode={mapMode}
                                        onSelectCountry={handleSelectCountry}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* ── Allocations Panel ── */}
                {showAllocations && (
                    <div className="allocations-panel">
                        <div className="allocations-header">
                            <h2>💰 $100M Allocation Plan</h2>
                            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                                Greedy allocation across {allocationsData.length} iterations · Click any row to see country detail
                            </span>
                            <Button
                                size="small"
                                type="text"
                                onClick={() => setShowAllocations(false)}
                                style={{ color: "var(--text-muted)", marginLeft: "auto" }}
                            >
                                ✕ Close
                            </Button>
                        </div>
                        <AllocationsTable onSelectCountry={handleSelectCountry} />
                    </div>
                )}

                {/* ── Tooltip ── */}
                <Tooltip
                    visible={tooltip.visible}
                    x={tooltip.x}
                    y={tooltip.y}
                    iso3={tooltip.iso3}
                    geoName={tooltip.geoName}
                    mapMode={mapMode}
                />
            </div>
        </ConfigProvider>
    );
}
