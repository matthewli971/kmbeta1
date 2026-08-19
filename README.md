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
-   **Route ETA Window**: Click route number in the stop monitor to view route-stop ETAs.
-   **Stop ETA Window**: View all route ETAs at that stop through "i" button in stops showing in stop monitor and route ETA window.
-   **Date Countdown**: Display remaining days before the designated date
-   **Bus Stop Refresh Indicators**: Shows loading spinner to indicate the loading state by bus stops
-   **Route Search**: Searches KMB and Citybus routes by route-number prefix and opens the outbound, service-type 1 route view.
-   **Daily Route Cache**: Stores the route list locally and refreshes it after 5:15 AM Hong Kong time.

## Usage

Open a location page in a modern web browser:

- `stp.html` for HK Science Park (the default `index.html` page opens the same monitor)

Each location page loads the same application shell and shared monitor logic. Its location-specific stops, ordering, and display options live in `config/stp.js` , so functional fixes only need to be made once in `script.js` or `bootstrap.js`.

## Development

This is a static HTML/CSS/JS project. No build step is required.

### Tech Stack
-   HTML5
-   CSS3
-   Vanilla JavaScript
-   Data Source: data.gov.hk (KMB/LWB & Citybus APIs)
