// ===== Page Configuration =====
const APP_TITLE = "科學園收工搭車關注組";
const KMB_STOP_URL = window.API_ENDPOINTS.kmb.stop;

// ===== Stop Definitions =====
const STOPS = [
    {
        id: "hkstp3",
        name: "香港科學園第三期 (巴士總站)",
        stops: [
            { id: "6E821768CA09E8C9", code: "PA113", label: null, type: "KMB" },
            { id: "A9459D38A4A41F36", code: "PA115", label: null, type: "KMB" },
            { id: "27F96537744C6792", code: "PA116", label: null, type: "KMB" },
            { id: "003840", code: "003840", label: null, type: "CTB" }
        ],
        filter: null,
        exclude: null,
        pin: ["43P", "272S"]
    },
    {
        id: "tate_kln",
        name: "大老山隧道 (九龍方向)",
        stops: [
            { id: "3114213F8975F536", code: "ST790", label: "A3", type: "KMB" },
            { id: "30D564180B68ECA8", code: "ST791", label: "A2", type: "KMB" },
            { id: "FFBEBD7068E01EA4", code: "ST792", label: "A1", type: "KMB" },
            { id: "001986", code: "001986", label: null, type: "CTB" }
        ],
        filter: null,
        exclude: null,
        pin: ["74D", "74P", "80X", "83X", "85X", "88X", "89C", "89D", "89X", "96", "272S"]
    },
    {
        id: "science_park_rd",
        name: "科研路 (九龍方向)",
        stops: [
            { id: "39E7051B17D302DA", code: "PA214", label: null, type: "KMB" },
            { id: "B644204AEDE7A031", code: "PA215", label: null, type: "KMB" },
            { id: "B464BD6334A93FA1", code: "PA216", label: null, type: "KMB" },
            { id: "A3D85C5591D7F0CA", code: "PA217", label: null, type: "KMB" },
            { id: "003738", code: "003738", label: null, type: "CTB" }
        ],
        filter: null,
        exclude: null,
        pin: ["74D", "74P", "96", "271B", "272A", "272X"]
    },
    {
        id: "tate_st",
        name: "大老山隧道 (沙田/大埔方向)",
        stops: [
            { id: "9961C7ED914E87DD", code: "ST110", label: "B4", type: "KMB" },
            { id: "7BFC2AE979358DA7", code: "ST111", label: "B3", type: "KMB" },
            { id: "9274EF6791CA3ED8", code: "ST113", label: "B1", type: "KMB" },
            { id: "001985", code: "001985", label: null, type: "CTB" }
        ],
        filter: null,
        exclude: null,
        pin: ["74D", "74P", "80X", "83X", "85X", "88X", "89C", "89D", "89X", "96", "272S"]
    },
    {
        id: "hkstp",
        name: "香港科學園 (巴士總站)",
        stops: [
            { id: "9C6800DD6E0CD683", code: "PA111", label: null, type: "KMB" },
            { id: "730AEBA1D2D8B20E", code: "PA112", label: null, type: "KMB" },
            { id: "003839", code: "003839", label: null, type: "CTB" }
        ],
        filter: null,
        exclude: null,
        pin: null
    },
    {
        id: "dih_stn_bt",
        name: "鑽石山站巴士總站",
        stops: [
            { id: "D7132C4D6287B688", code: "WT961", label: null, type: "KMB" }
        ],
        filter: null,
        exclude: null,
        pin: null
    },
    {
        id: "tshbbi_kln",
        name: "青沙公路轉車站 (九龍方向)",
        stops: [
            { id: "673B33867260EBB7", code: "TA752", label: "A4", type: "KMB" },
            { id: "F3433105FE5F6865", code: "TA753", label: "A3", type: "KMB" },
            { id: "FD8181D7574BB373", code: "TA754", label: "A2", type: "KMB" },
            { id: "9A26BDE49933CEA8", code: "TA755", label: "A1", type: "KMB" }
        ],
        filter: null,
        exclude: null,
        pin: null
    },
    {
        id: "gmb_phase3_chong_san",
        name: "創新路 (科學園第三期)",
        stops: [
            { id: "20007049", routeId: "2001821", code: "806A", label: null, type: "GMB" },
            { id: "20007049", routeId: "2001823", code: "806B", label: null, type: "GMB" }
        ],
        filter: null,
        exclude: null,
        pin: null
    },
    {
        id: "gmb_phase3_term",
        name: "香港科學園第三期 (小巴總站)",
        stops: [
            { id: "20015843", routeId: "2007862", code: "27A", label: null, type: "GMB" }
        ],
        filter: null,
        exclude: null,
        pin: null
    },
    {
        id: "gmb_foyin",
        name: "科研路 (朗濤)",
        stops: [
            { id: "20015842", routeId: "2007861", code: "27A", label: null, type: "GMB" },
            { id: "20009074", routeId: "2001825", code: "806C", label: null, type: "GMB" }
        ],
        filter: null,
        exclude: null,
        pin: null
    },
    {
        id: "gmb_west_ave_term",
        name: "科技大道西 (小巴總站)",
        stops: [
            { id: "20015838", routeId: "2007860", code: "27", label: null, type: "GMB" },
            { id: "20015844", routeId: "2007862", code: "27A", label: null, type: "GMB" }
        ],
        filter: null,
        exclude: null,
        pin: null
    },
    {
        id: "gmb_phase1_chong_san",
        name: "創新路 (科學園第一期)",
        stops: [
            { id: "20007047", routeId: "2001821", code: "806A", label: null, type: "GMB" },
            { id: "20007047", routeId: "2001823", code: "806B", label: null, type: "GMB" }
        ],
        filter: null,
        exclude: null,
        pin: null
    },
    {
        id: "gmb_west_ave_11",
        name: "科技大道西11號",
        stops: [
            { id: "20009073", routeId: "2001825", code: "806C", label: null, type: "GMB" }
        ],
        filter: null,
        exclude: null,
        pin: null
    }
];

const INBOUND_FLIP = ["680"];

// ===== Priority Configuration =====
const PRIORITY_CONFIG = [
    {
        start: "07:00",
        end: "11:00",
        order: [
            "hkstp",
            "tate_st",
            "hkstp3",
            "science_park_rd",
            "tate_kln"
        ]
    }
];

// ===== GMB Destination Mapping =====
const GMB_META = {
    "2007860": { route: "27", "1": "沙田(排頭街)", "2": "香港科學園" },
    "2007861": { route: "27A", "1": "沙田(排頭街)", "2": "白石角(天賦海灣)" },
    "2007862": { route: "27A", "1": "沙田(排頭街)", "2": "白石角(天賦海灣)" },
    "2001821": { route: "806A", "1": "運頭塘", "2": "黃泥頭" },
    "2001823": { route: "806B", "1": "運頭塘", "2": "石門" },
    "2001825": { route: "806C", "1": "運頭塘", "2": "香港科學園" }
};

// ===== Destination Replacements =====
const DEST_REPLACEMENTS = {
    "機場(地面運輸中心)": "機場"
};

// ===== Grid Layout (2-column pinned positions) =====
// Items listed here are pinned to the top rows in the wide-screen 2-column grid.
// They fill left-to-right, 2 per row. Remaining stops auto-flow after these.
const GRID_LAYOUT = [
    "hkstp3",           // r1 left:  香港科學園第三期 (巴士總站)
    "science_park_rd",  // r1 right: 科研路 (九龍方向)
    "tate_kln",         // r2 left:  大老山隧道 (九龍方向)
    "hkstp"             // r2 right: 香港科學園 (巴士總站)
];
