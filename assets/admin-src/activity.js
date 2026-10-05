  const activityActionLabels = {
    admin_login: "Admin signed in",
    admin_logout: "Admin signed out",
    newsletter_saved: "Newsletter saved",
    newsletter_test_sent: "Newsletter test sent",
    newsletter_sent: "Newsletter sent",
    newsletter_scheduled: "Newsletter scheduled",
    newsletter_cancelled: "Newsletter schedule cancelled",
  };

  function activityActionLabel(action) {
    return activityActionLabels[action] || String(action || "").replace(/_/g, " ");
  }

  function renderActivityLog() {
    qsa("[data-activity-filter]").forEach(function (button) {
      const value = button.getAttribute("data-activity-filter") || "";
      button.classList.toggle("is-active", value === state.activityFilter);
    });
    const root = qs("#activityLogTable");
    if (!root) return;
    root.innerHTML = tableMarkup(
      "table",
      [
        { label: "When", render: function (row) { return escapeHtml(formatDate(row.createdAt)); } },
        { label: "Activity", render: function (row) { return "<b>" + escapeHtml(activityActionLabel(row.action)) + "</b><br><small>" + escapeHtml(row.detail || "") + "</small>"; } },
        { label: "Admin", key: "adminEmail" },
      ],
      state.activities,
      "No matching activity yet.",
    );
  }

  async function loadActivity(options) {
    const root = qs("#activityLogTable");
    if (!root) return;
    const force = Boolean(options && options.force);
    if (!force && state.activities.length) {
      renderActivityLog();
      return;
    }
    setStatus("#activityLogStatus", "Loading activity...", null);
    const suffix = state.activityFilter ? "?filter=" + encodeURIComponent(state.activityFilter) : "";
    try {
      const data = await api("activity" + suffix + (suffix ? "&" : "?") + "limit=50");
      state.activities = Array.isArray(data.activities) ? data.activities : [];
      renderActivityLog();
      setStatus("#activityLogStatus", state.activities.length ? "" : "No matching activity yet.", true);
    } catch (error) {
      state.activities = [];
      renderActivityLog();
      setStatus("#activityLogStatus", error.message || "Activity could not be loaded.", false);
      if (options && options.throwOnError) throw error;
    }
  }


document.addEventListener("click", function (event) {
    const activityFilterButton = event.target.closest("[data-activity-filter]");
    if (activityFilterButton) {
      state.activityFilter = activityFilterButton.getAttribute("data-activity-filter") || "";
      loadActivity({ force: true });
      return;
    }

    const activityRefreshButton = event.target.closest("#activityRefreshBtn");
    if (activityRefreshButton) {
      loadActivity({ force: true });
      return;
    }
});


pageLoaders.activity = function (options) {
  return loadActivity({ force: Boolean(options && options.force), throwOnError: true });
};
