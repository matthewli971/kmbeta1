// ===== Page Configuration =====
const APP_TITLE = "油塘居民安心出門/歸家關注組";

// ===== Stop Definitions =====
const STOPS = [
    {
        id: "ko_yee_dn",
        name: "高怡邨 (下行)",
        stops: [
            { id: "19171A194D7507D5", code: "LT383", label: null, type: "KMB" },
            { id: "001790", code: "001790", label: null, type: "CTB" }
        ],
        filter: null,
        exclude: null,
        pin: ["14B", "216M", "603", "603S", "613", "88X"]
    },
    {
        id: "ko_yee_up",
        name: "高怡邨 (上行)",
        stops: [
            { id: "40FF132FB8E77051", code: "LT115", label: null, type: "KMB" },
            { id: "001793", code: "001793", label: null, type: "CTB" }
        ],
        filter: null,
        exclude: null,
        pin: ["14", "14H", "14X", "214", "E22P", "E22X", "A26"]
    },
    {
        id: "lymp",
        name: "鯉魚門廣場",
        stops: [
            { id: "5309D748976029CB", code: "LT601", label: null, type: "KMB" }
        ],
        filter: ["14D", "6E", "33", "33B", "33X", "62X", "74", "259D"],
        exclude: null,
        pin: null
    },
    {
        id: "st_antonius_kt",
        name: "聖安當女書院 (觀塘方向)",
        stops: [
            { id: "ADE2159E78D37819", code: "LT603", label: null, type: "KMB" },
            { id: "72155034783E2E96", code: "LT604", label: null, type: "KMB" },
            { id: "73E85E88E124EF2C", code: "LT605", label: null, type: "KMB" }
        ],
        filter: null,
        exclude: null,
        pin: null
    },
    {
        id: "lam_tin_bus_term",
        name: "藍田巴士總站",
        stops: [
            { id: "B1B0E08245C0FC15", code: "LT908", label: null, type: "KMB" },
            { id: "001519", code: "001519", label: null, type: "CTB" }
        ],
        filter: ["14", "14B", "14X", "215X", "216M", "A22|O"],
        exclude: null,
        pin: null
    },
    {
        id: "tong_yan_street",
        name: "同仁街",
        stops: [
            { id: "B5CB3F0D26BBBD03", code: "KT538", label: null, type: "KMB" }
        ],
        filter: ["14B"],
        exclude: null,
        pin: null
    },
    {
        id: "kttc",
        name: "觀塘市中心",
        stops: [
            { id: "14CF94DF66FCD0C8", code: "KT346", label: null, type: "KMB" },
            { id: "EB177E95B39626AE", code: "KT347", label: null, type: "KMB" },
            { id: "0B8C52E4C34E3B64", code: "KT348", label: null, type: "KMB" },
            { id: "C69F10C6D4676331", code: "KT348", label: null, type: "KMB" },
            { id: "5FD7848A339751B6", code: "KT349", label: null, type: "KMB" },
            { id: "2437897A21642D85", code: "KT350", label: null, type: "KMB" },
            { id: "F2127FD781019971", code: "KT351", label: null, type: "KMB" },
            { id: "80B56E2C7719DAF4", code: "KT352", label: null, type: "KMB" }
        ],
        filter: null,
        exclude: null,
        pin: ["14", "14X"]
    },
    {
        id: "gmb_lymp",
        name: "鯉魚門道 (近油美苑淮美閣)",
        stops: [
            { id: "20015080", routeId: "2007002", code: "76B", label: null, type: "GMB" }
        ],
        filter: null,
        exclude: null,
        pin: null
    }
];

const INBOUND_FLIP = [];

// ===== Priority Configuration =====
const PRIORITY_CONFIG = [];

// ===== GMB Destination Mapping =====
const GMB_META = {
    "2007002": { route: "76B", "1": "油塘公共運輸交匯處", "2": "基督教聯合醫院" }
};

// ===== Destination Replacements =====
const DEST_REPLACEMENTS = {
    "機場(地面運輸中心)": "機場"
};



// ===== Grid Layout (2-column pinned positions) =====
// Items listed here are pinned to the top rows in the wide-screen 2-column grid.
// They fill left-to-right, 2 per row. Remaining stops auto-flow after these.
const GRID_LAYOUT = [
    "ko_yee_dn",       // r1 left  
    "ko_yee_up",  // r1 right 
    "st_antonius_kt",       // r2 left  
    "kttc"             // r2 right 
];
