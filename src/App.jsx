import { useState, useCallback, useRef } from "react";
import {
    ComposableMap,
    Geographies,
    Geography,
    ZoomableGroup,
} from "react-simple-maps";
import { scaleQuantize } from "d3-scale";
import { Segmented, Table, ConfigProvider, theme } from "antd";
import rawData from "./data/strain_2024.json";

// ─── TopoJSON URL ────────────────────────────────────────────────────────────
const GEO_URL =
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// ─── Metric Definitions ───────────────────────────────────────────────────────
const METRICS = [
    { key: "strain_index", label: "Strain Index" },
    { key: "burden_score", label: "Burden Score" },
    { key: "capacity_gap", label: "Capacity Gap" },
    { key: "affordability_gap", label: "Affordability Gap" },
];

const METRIC_LABELS = {
    strain_index: "Strain Index",
    burden_score: "Burden Score",
    capacity_gap: "Capacity Gap",
    affordability_gap: "Affordability Gap",
};

// ─── Color Scale ──────────────────────────────────────────────────────────────
const COLOR_RANGE = [
    "#1a3a5c",
    "#1e4d7b",
    "#1a6290",
    "#1478a0",
    "#1b90b0",
    "#34a9c2",
    "#5cbecf",
    "#91d3d9",
    "#f5a623",
    "#f87421",
    "#f85149",
];
const COLOR_NO_DATA = "#2a3139";
const COLOR_STROKE = "#0d1117";

// ─── Build lookup: iso3 → record ─────────────────────────────────────────────
const dataByIso3 = Object.fromEntries(
    rawData.map((d) => [d.iso3, d])
);

// All metric values (for scale domains)
function getDomain(metric) {
    const vals = rawData.map((d) => d[metric]).filter((v) => v != null);
    return [Math.min(...vals), Math.max(...vals)];
}

function buildScale(metric) {
    const domain = getDomain(metric);
    return scaleQuantize().domain(domain).range(COLOR_RANGE);
}

// ─── Top 10 Table ─────────────────────────────────────────────────────────────
function Top10Table({ metric }) {
    const sorted = [...rawData]
        .filter((d) => d[metric] != null)
        .sort((a, b) => b[metric] - a[metric])
        .slice(0, 10);

    const maxVal = sorted[0]?.[metric] ?? 1;

    const columns = [
        {
            title: "Rank",
            dataIndex: "rank",
            key: "rank",
            width: 50,
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
            dataIndex: metric,
            key: "value",
            width: 110,
            render: (val) => {
                const pct = (val / maxVal) * 100;
                const color =
                    pct > 75
                        ? "#f85149"
                        : pct > 55
                            ? "#f5a623"
                            : pct > 35
                                ? "#34a9c2"
                                : "#1e4d7b";
                return (
                    <div className="value-bar-wrapper">
                        <div className="value-bar-bg">
                            <div
                                className="value-bar-fill"
                                style={{ width: `${pct}%`, background: color }}
                            />
                        </div>
                        <span className="value-text">{val?.toFixed(3)}</span>
                    </div>
                );
            },
        },
    ];

    return (
        <Table
            dataSource={sorted.map((d, i) => ({ ...d, key: d.iso3 }))}
            columns={columns}
            pagination={false}
            size="small"
            style={{ background: "transparent" }}
        />
    );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
function Tooltip({ visible, x, y, data, activeMetric }) {
    if (!visible) return null;

    const style = {
        left: x + 14,
        top: y - 10,
        // flip left if too close to right edge
        ...(x > window.innerWidth - 240 ? { left: x - 214 } : {}),
    };

    if (!data) {
        return (
            <div className="tooltip" style={style}>
                <div className="tooltip-country">No Data</div>
                <div className="tooltip-no-data">This country has no data for 2024.</div>
            </div>
        );
    }

    return (
        <div className="tooltip" style={style}>
            <div className="tooltip-country">{data.country}</div>
            {METRICS.map(({ key, label }) => (
                <div className="tooltip-row" key={key}>
                    <span className="tooltip-metric-name">{label}</span>
                    <span
                        className={`tooltip-metric-value ${key === activeMetric ? "highlighted" : ""
                            }`}
                    >
                        {data[key]?.toFixed(4) ?? "—"}
                    </span>
                </div>
            ))}
        </div>
    );
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function Legend({ metric }) {
    const domain = getDomain(metric);
    return (
        <div className="legend-bar">
            <span className="legend-label">Low</span>
            <div className="legend-gradient" />
            <span className="legend-label">High</span>
            <span className="legend-label" style={{ marginLeft: 12, color: "var(--text-muted)" }}>
                {METRIC_LABELS[metric]}: {domain[0].toFixed(3)} → {domain[1].toFixed(3)}
            </span>
        </div>
    );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
    const [metric, setMetric] = useState("strain_index");
    const [tooltip, setTooltip] = useState({
        visible: false,
        x: 0,
        y: 0,
        data: null,
    });

    const colorScale = buildScale(metric);

    const handleMouseEnter = useCallback((geo, e) => {
        // react-simple-maps uses numeric ISO codes; we need iso3
        // The GeoJSON properties vary by TopoJSON; world-atlas stores numeric id
        // We match via the `name` property when available, or by numeric→iso3 map
        const countryName = geo.properties.name;
        const match = rawData.find(
            (d) =>
                d.country === countryName ||
                d.country.toLowerCase() === countryName?.toLowerCase()
        );
        setTooltip({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            data: match ?? null,
            countryName: countryName ?? "Unknown",
        });
    }, []);

    const handleMouseMove = useCallback((e) => {
        setTooltip((prev) => ({ ...prev, x: e.clientX, y: e.clientY }));
    }, []);

    const handleMouseLeave = useCallback(() => {
        setTooltip((prev) => ({ ...prev, visible: false }));
    }, []);

    const getFillColor = (geo) => {
        const countryName = geo.properties.name;
        const match = rawData.find(
            (d) =>
                d.country === countryName ||
                d.country.toLowerCase() === countryName?.toLowerCase()
        );
        if (!match) return COLOR_NO_DATA;
        const val = match[metric];
        if (val == null) return COLOR_NO_DATA;
        return colorScale(val);
    };

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
                        <span>Select a metric to update the visualization</span>
                    </div>
                    <Segmented
                        value={metric}
                        onChange={setMetric}
                        options={METRICS.map(({ key, label }) => ({
                            label,
                            value: key,
                        }))}
                        style={{ flexShrink: 0 }}
                    />
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
                                            geographies.map((geo) => (
                                                <Geography
                                                    key={geo.rsmKey}
                                                    geography={geo}
                                                    fill={getFillColor(geo)}
                                                    stroke={COLOR_STROKE}
                                                    strokeWidth={0.4}
                                                    onMouseEnter={(e) => handleMouseEnter(geo, e)}
                                                    onMouseLeave={handleMouseLeave}
                                                    style={{
                                                        default: { outline: "none" },
                                                        hover: {
                                                            outline: "none",
                                                            opacity: 0.85,
                                                            filter: "brightness(1.2)",
                                                        },
                                                        pressed: { outline: "none" },
                                                    }}
                                                />
                                            ))
                                        }
                                    </Geographies>
                                </ZoomableGroup>
                            </ComposableMap>
                        </div>
                        <Legend metric={metric} />
                    </div>

                    {/* ── Side Panel ── */}
                    <div className="side-panel">
                        <div className="side-panel-header">
                            <h2>Top 10 Countries</h2>
                            <p>Ranked by {METRIC_LABELS[metric]}</p>
                        </div>
                        <div className="side-panel-table">
                            <Top10Table metric={metric} />
                        </div>
                    </div>
                </div>

                {/* ── Tooltip ── */}
                <Tooltip
                    visible={tooltip.visible}
                    x={tooltip.x}
                    y={tooltip.y}
                    data={tooltip.data}
                    activeMetric={metric}
                />
            </div>
        </ConfigProvider>
    );
}
