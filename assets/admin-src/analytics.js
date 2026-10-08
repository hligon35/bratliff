  async function loadAnalytics() {
    const data = await api("analytics/summary?days=" + encodeURIComponent(state.analyticsRangeDays));
    renderAnalytics(data);
    try {
      renderResourceAnalytics(await api("resources/summary"));
    } catch (error) {
      const status = qs("#resourceAnalyticsStatus");
      if (status) status.textContent = error.message || "Resource reporting is unavailable.";
    }
  }

  function renderResourceAnalytics(data) {
    const metrics = qs("#resourceMetrics");
    if (metrics) {
      metrics.innerHTML =
        '<div class="metric"><strong>' + escapeHtml(String(data.totalRegistrations || 0)) + '</strong><span>Registrations</span></div>' +
        '<div class="metric"><strong>' + escapeHtml(String(data.totalViews || 0)) + '</strong><span>Guide Views</span></div>' +
        '<div class="metric"><strong>' + escapeHtml(String(data.totalDownloads || 0)) + '</strong><span>Guide Downloads</span></div>';
    }
    const guideBreakdown = qs("#resourceGuideBreakdown");
    if (guideBreakdown) {
      guideBreakdown.innerHTML = tableMarkup("table", [
        { label: "Guide", render: function (row) { return escapeHtml(row.title); } },
        { label: "Viewed", render: function (row) { return escapeHtml(String(row.views || 0)); } },
        { label: "Downloads", render: function (row) { return escapeHtml(String(row.downloads || 0)); } },
      ], data.guides || [], "No guides configured.");
    }
    const registrations = qs("#resourceRegistrations");
    if (registrations) {
      registrations.innerHTML = tableMarkup("table", [
        { label: "Date", render: function (row) { return escapeHtml(row.createdAt || ""); } },
        { label: "Name", render: function (row) { return escapeHtml((row.firstName || "") + " " + (row.lastName || "")); } },
        { label: "Email", render: function (row) { return escapeHtml(row.email || ""); } },
        { label: "Organization", render: function (row) { return escapeHtml(row.organization || ""); } },
        { label: "Audience", render: function (row) { return escapeHtml(row.audience || ""); } },
        { label: "Selected guide", render: function (row) { return escapeHtml(row.selectedResource || ""); } },
        { label: "News opt-in", render: function (row) { return Number(row.marketingOptIn) ? "Yes" : "No"; } },
      ], data.registrations || [], "No Resource Library registrations yet.");
    }
  }

  function formatShortDay(value) {
    const parts = String(value || "").split("-");
    if (parts.length !== 3) return String(value || "");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthName = months[Number(parts[1]) - 1] || parts[1];
    return monthName + " " + Number(parts[2]);
  }

  function buildTrendChart(rows) {
    const width = 720;
    const height = 260;
    const padLeft = 44;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 34;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;
    const max = rows.reduce(function (highest, row) { return Math.max(highest, row.count); }, 0) || 1;
    const stepX = rows.length > 1 ? plotWidth / (rows.length - 1) : 0;
    const points = rows.map(function (row, index) {
      return {
        x: padLeft + stepX * index,
        y: padTop + plotHeight - (row.count / max) * plotHeight,
        day: row.day,
        count: row.count,
      };
    });
    const linePath = points
      .map(function (point, index) {
        return (index === 0 ? "M" : "L") + point.x.toFixed(1) + "," + point.y.toFixed(1);
      })
      .join(" ");
    const gridLines = [0, 0.5, 1]
      .map(function (fraction) {
        const y = padTop + plotHeight * (1 - fraction);
        return (
          '<line class="analytics-chart-grid" x1="' + padLeft + '" y1="' + y.toFixed(1) + '" x2="' + (width - padRight) + '" y2="' + y.toFixed(1) + '"></line>' +
          '<text class="analytics-chart-axis" x="' + (padLeft - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + escapeHtml(String(Math.round(max * fraction))) + "</text>"
        );
      })
      .join("");
    const labelStep = Math.max(1, Math.ceil(points.length / 7));
    const xLabels = points
      .map(function (point, index) {
        if (index % labelStep !== 0 && index !== points.length - 1) return "";
        return (
          '<text class="analytics-chart-axis" x="' + point.x.toFixed(1) + '" y="' + (height - padBottom + 18) + '" text-anchor="middle">' +
          escapeHtml(formatShortDay(point.day)) +
          "</text>"
        );
      })
      .join("");
    const dots = points
      .map(function (point) {
        return (
          '<circle class="analytics-chart-dot" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="3.5">' +
          "<title>" + escapeHtml(formatShortDay(point.day)) + ": " + escapeHtml(String(point.count)) + "</title>" +
          "</circle>"
        );
      })
      .join("");
    return (
      '<svg class="analytics-chart" viewBox="0 0 ' + width + " " + height + '" preserveAspectRatio="none" role="img" aria-label="Daily page views line chart">' +
      gridLines +
      xLabels +
      '<path class="analytics-chart-line" d="' + linePath + '"></path>' +
      dots +
      "</svg>"
    );
  }

  function renderAnalytics(data) {
    const metrics = qs("#analyticsMetrics");
    if (metrics) {
      metrics.innerHTML =
        '<div class="metric"><strong>' + escapeHtml(String(data.totalPageViews || 0)) + '</strong><span>Page Views</span></div>' +
        '<div class="metric"><strong>' + escapeHtml(String(data.totalEvents || 0)) + '</strong><span>Total Events</span></div>' +
        '<div class="metric"><strong>' + escapeHtml(String(data.totalSponsors || 0)) + '</strong><span>Paid Sponsorships</span></div>' +
        '<div class="metric"><strong>' + escapeHtml(formatMoney(data.totalSponsorRevenue || 0)) + '</strong><span>Sponsorship Revenue</span></div>' +
        '<div class="metric"><strong>' + escapeHtml(formatMoney(data.bookRevenue || 0)) + '</strong><span>Book Revenue</span></div>';
    }

    const topPages = qs("#analyticsTopPages");
    if (topPages) {
      topPages.innerHTML = tableMarkup(
        "table",
        [
          { label: "Page", render: function (row) { return escapeHtml(row.pagePath || "/"); } },
          { label: "Views", key: "count" },
        ],
        data.topPages || [],
        "No page view data yet.",
      );
    }

    const eventBreakdown = qs("#analyticsEventBreakdown");
    if (eventBreakdown) {
      eventBreakdown.innerHTML = tableMarkup(
        "table",
        [
          { label: "Event", render: function (row) { return escapeHtml(row.eventType); } },
          { label: "Count", key: "count" },
        ],
        data.eventBreakdown || [],
        "No events recorded yet.",
      );
    }

    const trend = qs("#analyticsTrend");
    if (trend) {
      const rows = data.dailyTrend || [];
      trend.innerHTML = rows.length ? buildTrendChart(rows) : '<p class="asset-note">No page view data yet.</p>';
    }

    const sponsorBreakdown = qs("#analyticsSponsorBreakdown");
    if (sponsorBreakdown) {
      sponsorBreakdown.innerHTML = tableMarkup(
        "table",
        [
          { label: "Package", render: function (row) { return escapeHtml(row.label || row.package || ""); } },
          { label: "Paid Sponsorships", key: "sponsorCount" },
          { label: "Revenue", render: function (row) { return escapeHtml(formatMoney(row.totalRevenue)); } },
        ],
        data.sponsorBreakdown || [],
        "No paid sponsorships in this range yet.",
      );
    }
  }


  qs("#analyticsRangeFilter")?.addEventListener("change", function (event) {
    state.analyticsRangeDays = parseInt(event.target.value, 10) || 30;
    loadAnalytics().catch(function () {});
  });



pageLoaders.analytics = loadAnalytics;
