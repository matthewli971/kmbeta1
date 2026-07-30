# HK Bus Stop ETA Monitor

A web application to display real-time bus arrival times for specific Hong Kong bus stops, mimicking the KMB display panel style.

## Features

-   **Real-time Data**: Fetches data from `data.gov.hk` (KMB/LWB and Citybus APIs).
-   **Dual Display Modes**:
    -   **Mode A (Classic)**: Exact time on top, countdown on bottom.
    -   **Mode B (Countdown)**: Countdown on top, exact time on bottom (optimized for quick reading).
-   **Smart Grouping**: Groups routes by Route Number and Direction to prevent duplicate entries.
-   **Smart Sorting**: Automatically sorts routes by the earliest upcoming ETA.
-   **Auto-refresh**: Updates ETA data every 30 seconds and countdowns every second.
-   **Responsive Design**: Optimized for both desktop and mobile viewing.
-   **Dark Mode UI**: High contrast design for easy readability.

## Supported Stops

-   **HK Science Park Phase 3**: PA113, PA115, PA116, 003840 (Citybus)
-   **Fo Yin Road (Kowloon Bound)**: PA214, PA215, PA216, PA217, 003738 (Citybus)
-   **Tate's Cairn Tunnel**: ST790 (A3), ST791 (A2) - Displays all routes.

## Usage

Simply open `index.html` in a modern web browser. Use the toggle switch in the header to switch between Display Mode A and Mode B.

## Development

This is a static HTML/CSS/JS project. No build step is required.

### Tech Stack
-   HTML5
-   CSS3
-   Vanilla JavaScript
-   Data Source: data.gov.hk (KMB/LWB & Citybus APIs)
