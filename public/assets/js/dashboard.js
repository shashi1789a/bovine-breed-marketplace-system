async function loadStats() {

    const response = await fetch(
        "/api/v1/dashboard/stats"
    );

    const data = await response.json();

    document.getElementById("stats").innerHTML = `
        <h2>Total Videos: ${data.totalVideos || 0}</h2>
    `;
}

loadStats();