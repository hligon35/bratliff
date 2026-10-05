  function initStoreActionRow() {
    if (state.page !== "store") return;
    const tools = qs("[data-store-tools]");
    const setupButton = qs("#setupBtn");
    if (!tools) return;
    if (setupButton && setupButton.parentElement !== tools) tools.appendChild(setupButton);
  }


  function showStoreView(name) {
    qsa("[data-store-tab]").forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-store-tab") === name);
    });
    qsa("[data-store-view]").forEach(function (view) {
      view.classList.toggle("show", view.getAttribute("data-store-view") === name);
    });
  }


  function computeStoreMetrics() {
    const paidOrders = state.orders.filter(function (order) {
      return String(order.paymentStatus || "").toLowerCase() === "paid";
    });
    const totalSales = paidOrders.reduce(function (sum, order) {
      return sum + Number(order.total || 0);
    }, 0);
    const booksSold = paidOrders.reduce(function (sum, order) {
      if (!Array.isArray(order.items)) return sum;
      return sum + order.items.reduce(function (qty, item) {
        return qty + Number(item.quantity || 0);
      }, 0);
    }, 0);
    const lowStockCount = state.books.filter(function (book) {
      return String(book.status || "") === "Published" && Number(book.stock || 0) <= Number(book.lowStockThreshold || 0);
    }).length;
    return [
      ["Total Sales", formatMoney(totalSales)],
      ["Books Sold", booksSold || "0"],
      ["Orders", paidOrders.length],
      ["Average Order", paidOrders.length ? formatMoney(totalSales / paidOrders.length) : formatMoney(0)],
      ["Low Stock", lowStockCount],
    ];
  }


  function includesNeedle(parts, needle) {
    if (!needle) return true;
    const haystack = parts.join(" ").toLowerCase();
    return haystack.indexOf(needle.toLowerCase()) !== -1;
  }

  function filteredOrders() {
    const search = state.orderFilters.search.trim().toLowerCase();
    const payment = state.orderFilters.payment.toLowerCase();
    const fulfillment = state.orderFilters.fulfillment.toLowerCase();
    const rows = state.orders.filter(function (order) {
      if (payment && String(order.paymentStatus || "").toLowerCase() !== payment) return false;
      if (fulfillment && String(order.fulfillmentStatus || "").toLowerCase() !== fulfillment) return false;
      return includesNeedle([
        order.orderNumber,
        order.customer,
        order.email,
        order.trackingNumber,
      ], search);
    });
    rows.sort(function (left, right) {
      switch (state.orderFilters.sort) {
        case "date-asc":
          return asTime(left.date) - asTime(right.date);
        case "total-desc":
          return Number(right.total || 0) - Number(left.total || 0);
        case "total-asc":
          return Number(left.total || 0) - Number(right.total || 0);
        case "customer-asc":
          return String(left.customer || "").localeCompare(String(right.customer || ""));
        case "date-desc":
        default:
          return asTime(right.date) - asTime(left.date);
      }
    });
    return rows;
  }

  function filteredInventory() {
    const search = state.inventoryFilters.search.trim().toLowerCase();
    const status = state.inventoryFilters.status.toLowerCase();
    const health = state.inventoryFilters.health;
    const rows = state.books.filter(function (book) {
      const lowStock = Number(book.stock || 0) <= Number(book.lowStockThreshold || 0) && String(book.status || "") !== "Archived";
      if (status && String(book.status || "").toLowerCase() !== status) return false;
      if (health === "low" && !lowStock) return false;
      if (health === "healthy" && lowStock) return false;
      return includesNeedle([book.title, book.sku, book.author, book.category], search);
    });
    rows.sort(function (left, right) {
      switch (state.inventoryFilters.sort) {
        case "title-asc":
          return String(left.title || "").localeCompare(String(right.title || ""));
        case "title-desc":
          return String(right.title || "").localeCompare(String(left.title || ""));
        case "stock-asc":
          return Number(left.stock || 0) - Number(right.stock || 0);
        case "stock-desc":
          return Number(right.stock || 0) - Number(left.stock || 0);
        case "price-desc":
          return Number(right.price || 0) - Number(left.price || 0);
        case "price-asc":
          return Number(left.price || 0) - Number(right.price || 0);
        case "updated-desc":
        default:
          return asTime(right.updated) - asTime(left.updated);
      }
    });
    return rows;
  }

  function filteredBooks() {
    const search = state.bookFilters.search.trim().toLowerCase();
    const status = state.bookFilters.status.toLowerCase();
    const rows = state.books.filter(function (book) {
      if (status && String(book.status || "").toLowerCase() !== status) return false;
      return includesNeedle([book.title, book.sku, book.author, book.category], search);
    });
    rows.sort(function (left, right) {
      switch (state.bookFilters.sort) {
        case "title-asc":
          return String(left.title || "").localeCompare(String(right.title || ""));
        case "stock-asc":
          return Number(left.stock || 0) - Number(right.stock || 0);
        case "price-asc":
          return Number(left.price || 0) - Number(right.price || 0);
        case "price-desc":
          return Number(right.price || 0) - Number(left.price || 0);
        case "updated-desc":
        default:
          return asTime(right.updatedAt) - asTime(left.updatedAt);
      }
    });
    return rows;
  }

  function renderStoreMetrics() {
    const root = qs("#metrics");
    if (!root) return;
    root.innerHTML = computeStoreMetrics()
      .map(function (entry) {
        return '<div class="metric"><strong>' + escapeHtml(String(entry[1])) + '</strong><span>' + escapeHtml(entry[0]) + "</span></div>";
      })
      .join("");
  }

  function renderStoreOrders() {
    const rows = filteredOrders();
    const html = tableMarkup(
      "table",
      [
        { label: "Order", render: function (order) { return "<b>" + escapeHtml(order.orderNumber || "") + "</b>"; } },
        { label: "Date", render: function (order) { return escapeHtml(formatDate(order.date, true)); } },
        { label: "Customer", render: function (order) { return escapeHtml(order.customer || "") + (order.email ? "<br><small>" + escapeHtml(order.email) + "</small>" : ""); } },
        { label: "Total", render: function (order) { return escapeHtml(formatMoney(order.total)); } },
        { label: "Payment", key: "paymentStatus" },
        { label: "Fulfillment", key: "fulfillmentStatus" },
      ],
      rows,
      "No orders yet.",
    );
    const orderList = qs("#orderList");
    const recentOrders = qs("#recentOrders");
    if (orderList) orderList.innerHTML = html;
    if (recentOrders) {
      recentOrders.innerHTML = tableMarkup(
        "table",
        [
          { label: "Order", render: function (order) { return "<b>" + escapeHtml(order.orderNumber || "") + "</b>"; } },
          { label: "Date", render: function (order) { return escapeHtml(formatDate(order.date, true)); } },
          { label: "Customer", render: function (order) { return escapeHtml(order.customer || ""); } },
          { label: "Total", render: function (order) { return escapeHtml(formatMoney(order.total)); } },
          { label: "Status", key: "fulfillmentStatus" },
        ],
        filteredOrders().slice(0, 8),
        "No orders yet.",
      );
    }
    const select = qs("#orderNumber");
    if (select) {
      const current = select.value;
      select.innerHTML = '<option value="">Select an order</option>' + state.orders
        .map(function (order) {
          return '<option value="' + escapeHtml(order.orderNumber) + '">' + escapeHtml(order.orderNumber + ' · ' + (order.customer || 'Customer')) + "</option>";
        })
        .join("");
      if (current) select.value = current;
    }
    const summary = qs("#orderFilterSummary");
    if (summary) summary.textContent = rows.length + " of " + state.orders.length + " orders shown";
  }

  function renderInventory() {
    const rows = filteredInventory().map(function (book) {
      const low = Number(book.stock || 0) <= Number(book.lowStockThreshold || 0) && String(book.status || "") === "Published";
      return {
        title: book.title,
        sku: book.sku,
        stock: book.stock,
        lowStockThreshold: book.lowStockThreshold,
        low: low,
      };
    });
    const root = qs("#inventoryList");
    if (root) {
      root.innerHTML = tableMarkup(
        "table",
        [
          { label: "Book", render: function (row) { return "<b>" + escapeHtml(row.title || "") + "</b>"; } },
          { label: "SKU", key: "sku" },
          { label: "Stock", key: "stock" },
          { label: "Alert At", key: "lowStockThreshold" },
          { label: "Status", render: function (row) { return '<span class="badge ' + (row.low ? 'low' : '') + '">' + (row.low ? 'Low stock' : 'Healthy') + '</span>'; } },
        ],
        rows,
        "No inventory yet.",
      );
    }
    const select = qs("#inventoryBookId");
    if (select) {
      const current = select.value;
      select.innerHTML = '<option value="">Select a book</option>' + state.books
        .map(function (book) {
          return '<option value="' + escapeHtml(book.bookId) + '">' + escapeHtml(book.title + ' (' + book.sku + ')') + "</option>";
        })
        .join("");
      if (current) select.value = current;
    }
    const summary = qs("#inventoryFilterSummary");
    if (summary) summary.textContent = rows.length + " of " + state.books.length + " books shown";
  }

  function renderBooks() {
    const root = qs("#bookList");
    if (!root) return;
    const rows = filteredBooks();
    root.innerHTML = selectableTableMarkup(
      "books",
      [
        { label: "Cover", render: function (book) { return book.imageUrl ? '<img class="cover" src="' + escapeHtml(book.imageUrl) + '" alt="">' : ""; } },
        { label: "Title", render: function (book) { return "<b>" + escapeHtml(book.title || "") + "</b><br><small>" + escapeHtml(book.author || "") + "</small>"; } },
        { label: "SKU", key: "sku" },
        { label: "Price", render: function (book) { return escapeHtml(formatMoney(book.price)); } },
        { label: "Stock", key: "stock" },
        { label: "Status", render: function (book) { return '<span class="badge">' + escapeHtml(book.status || "") + "</span>"; } },
        {
          label: "",
          render: function (book) {
            return '<span class="table-action-buttons book-table-actions">' +
              '<button class="btn alt" type="button" data-edit-book="' + escapeHtml(book.bookId) + '">Edit</button>' +
              '<button class="btn alt" type="button" data-duplicate-book="' + escapeHtml(book.bookId) + '">Duplicate</button>' +
              '<button class="btn warn icon-only" type="button" data-delete-book="' + escapeHtml(book.bookId) + '" data-icon="delete" aria-label="Remove ' + escapeHtml(book.title || "book") + '" title="Remove ' + escapeHtml(book.title || "book") + '"></button>' +
              '</span>';
          },
        },
      ],
      rows,
      "No books match the current filters.",
      function (book) { return book.bookId; },
      function (book) { return book.title || book.bookId; },
      "books",
      true,
    );
    const summary = qs("#bookFilterSummary");
    if (summary) summary.textContent = rows.length + " of " + state.books.length + " books shown";
    renderInventory();
    renderStoreMetrics();
  }

  function resetBookForm() {
    const form = qs("#bookForm");
    if (!form) return;
    form.reset();
    syncBookFormatPrice();
    const bookIdField = field(form, "bookId");
    const thresholdField = field(form, "lowStockThreshold");
    const fileInput = qs("#bookImage");
    if (bookIdField) bookIdField.value = "";
    if (thresholdField) thresholdField.value = 5;
    if (fileInput) fileInput.value = "";
    const title = qs("#formTitle");
    if (title) title.textContent = "Add Book";
    const preview = qs("#imagePreview");
    if (preview) preview.innerHTML = "<span>No image</span>";
    setStatus("#bookStatus", "", null);
  }

  async function deleteBookRow(bookId) {
    const book = state.books.find(function (entry) {
      return entry.bookId === bookId;
    });
    if (!window.confirm("Remove " + (book ? '"' + book.title + '"' : "this book") + "? Books with order or inventory history will be archived instead of permanently deleted.")) return;
    try {
      const result = await api("books/" + encodeURIComponent(bookId), { method: "DELETE" });
      if (safeValue(field(qs("#bookForm"), "bookId")) === bookId) resetBookForm();
      await loadBooks();
      setStatus("#bookStatus", result.message || "Book removed.", true);
    } catch (error) {
      setStatus("#bookStatus", error.message || "Book could not be removed.", false);
    }
  }

  async function duplicateBookRow(bookId) {
    const source = state.books.find(function (entry) {
      return entry.bookId === bookId;
    });
    if (!source) return;
    const suffix = "-COPY-" + String(Date.now()).slice(-4);
    const payload = {
      sku: String(source.sku || "BOOK").slice(0, 100 - suffix.length) + suffix,
      isbn: source.isbn || "",
      title: String(source.title || "Untitled Book") + " Copy",
      subtitle: source.subtitle || "",
      author: source.author || "",
      category: source.category || "",
      format: source.format || "Paperback",
      publicationDate: source.publicationDate || "",
      price: source.price || 0,
      comparePrice: source.comparePrice || 0,
      stock: 0,
      lowStockThreshold: source.lowStockThreshold || 5,
      shortDescription: source.shortDescription || "",
      synopsis: source.synopsis || "",
      status: "Draft",
      featured: false,
      comingSoon: false,
      preorder: false,
      squareCatalogItemId: "",
      squareCatalogVariationId: "",
    };
    try {
      setStatus("#bookStatus", "Duplicating...", null);
      const data = await api("books", { method: "POST", body: payload });
      await loadBooks();
      const duplicate = state.books.find(function (entry) {
        return entry.bookId === (data.book && data.book.bookId);
      });
      if (duplicate) populateBookForm(duplicate);
      setStatus("#bookStatus", "Book duplicated as a draft. Review the SKU and details before publishing.", true);
    } catch (error) {
      setStatus("#bookStatus", error.message || "Book could not be duplicated.", false);
    }
  }

  async function removeCurrentBookImage() {
    const form = qs("#bookForm");
    const fileInput = qs("#bookImage");
    const bookId = safeValue(field(form, "bookId"));
    const current = state.books.find(function (entry) { return entry.bookId === bookId; });
    if (fileInput) fileInput.value = "";
    if (!bookId) {
      const preview = qs("#imagePreview");
      if (preview) preview.innerHTML = "<span>No image</span>";
      return;
    }
    if (!current || !current.imageUrl) return;
    if (!window.confirm("Remove this book image?")) return;
    try {
      setStatus("#bookStatus", "Removing image...", null);
      await api("books/" + encodeURIComponent(bookId) + "/image", { method: "DELETE" });
      await loadBooks();
      populateBookForm(state.books.find(function (entry) { return entry.bookId === bookId; }));
      setStatus("#bookStatus", "Image removed.", true);
    } catch (error) {
      setStatus("#bookStatus", error.message || "Image could not be removed.", false);
    }
  }

  function populateBookForm(book) {
    const form = qs("#bookForm");
    if (!form || !book) return;
    [
      "bookId",
      "sku",
      "isbn",
      "title",
      "subtitle",
      "author",
      "category",
      "format",
      "publicationDate",
      "price",
      "comparePrice",
      "stock",
      "lowStockThreshold",
      "shortDescription",
      "synopsis",
      "status",
      "squareCatalogItemId",
      "squareCatalogVariationId",
    ].forEach(function (name) {
      const control = field(form, name);
      if (control) control.value = book[name] == null ? "" : book[name];
    });
    syncBookFormatPrice();
    ["featured", "comingSoon", "preorder"].forEach(function (name) {
      const control = field(form, name);
      if (control) control.checked = Boolean(book[name]);
    });
    const title = qs("#formTitle");
    if (title) title.textContent = "Edit Book";
    const fileInput = qs("#bookImage");
    if (fileInput) fileInput.value = "";
    const preview = qs("#imagePreview");
    if (preview) {
      preview.innerHTML = book.imageUrl ? '<img src="' + escapeHtml(book.imageUrl) + '" alt="">' : "<span>No image</span>";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function syncBookFormatPrice() {
    const form = qs("#bookForm");
    if (!form) return;
    const price = field(form, "price");
    const format = field(form, "format");
    if (!price || !format) return;
    const fixedPrice = { Paperback: "20.00", Hardcover: "25.00" }[format.value];
    price.readOnly = Boolean(fixedPrice);
    if (fixedPrice) price.value = fixedPrice;
  }

  function bookPayload() {
    const form = qs("#bookForm");
    const payload = {};
    if (!form) return payload;
    new FormData(form).forEach(function (value, key) {
      if (key !== "image") payload[key] = value;
    });
    ["featured", "comingSoon", "preorder"].forEach(function (name) {
      const control = field(form, name);
      payload[name] = Boolean(control && control.checked);
    });
    return payload;
  }

  async function saveBook(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus("#bookStatus", "Saving...", null);
    try {
      const data = await api("books", { method: "POST", body: bookPayload() });
      const fileInput = qs("#bookImage");
      const file = fileInput && fileInput.files ? fileInput.files[0] : null;
      let book = data.book;
      if (file && book && book.bookId) {
        const upload = new FormData();
        upload.set("file", file);
        await api("books/" + encodeURIComponent(book.bookId) + "/image", { method: "POST", body: upload });
      }
      state.books = [];
      await loadBooks();
      book = state.books.find(function (entry) {
        return entry.bookId === (book && book.bookId);
      }) || book;
      populateBookForm(book);
      if (fileInput) fileInput.value = "";
      setStatus("#bookStatus", "Saved.", true);
    } catch (error) {
      setStatus("#bookStatus", error.message || "Book could not be saved.", false);
    }
  }

  async function publishCurrentBook() {
    const form = qs("#bookForm");
    if (!form) return;
    if (!safeValue(field(form, "bookId"))) {
      window.alert("Save the book first.");
      return;
    }
    const payload = bookPayload();
    payload.status = "Published";
    setStatus("#bookStatus", "Publishing...", null);
    try {
      await api("books", { method: "POST", body: payload });
      await loadBooks();
      populateBookForm(state.books.find(function (entry) {
        return entry.bookId === payload.bookId;
      }));
      setStatus("#bookStatus", "Published.", true);
    } catch (error) {
      setStatus("#bookStatus", error.message || "The book could not be published.", false);
    }
  }

  async function archiveCurrentBook() {
    const form = qs("#bookForm");
    if (!form) return;
    if (!safeValue(field(form, "bookId"))) return;
    if (!window.confirm("Archive this book?")) return;
    const payload = bookPayload();
    payload.status = "Archived";
    setStatus("#bookStatus", "Archiving...", null);
    try {
      await api("books", { method: "POST", body: payload });
      await loadBooks();
      resetBookForm();
      setStatus("#bookStatus", "Archived.", true);
    } catch (error) {
      setStatus("#bookStatus", error.message || "The book could not be archived.", false);
    }
  }

  async function updateOrder(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const orderNumber = safeValue(field(form, "orderNumber"));
    if (!orderNumber) {
      setStatus("#orderStatus", "Choose an order first.", false);
      return;
    }
    setStatus("#orderStatus", "Saving...", null);
    try {
      await api("orders/" + encodeURIComponent(orderNumber) + "/fulfillment", {
        method: "POST",
        body: {
          fulfillmentStatus: safeValue(field(form, "fulfillmentStatus")),
          trackingNumber: safeValue(field(form, "trackingNumber")),
          notes: safeValue(field(form, "notes")),
        },
      });
      await loadOrders();
      setStatus("#orderStatus", "Saved.", true);
    } catch (error) {
      setStatus("#orderStatus", error.message || "Order could not be updated.", false);
    }
  }

  async function adjustInventory(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus("#inventoryStatus", "Applying adjustment...", null);
    try {
      await api("inventory/adjust", {
        method: "POST",
        body: {
          bookId: safeValue(field(form, "bookId")),
          change: safeValue(field(form, "change")),
          reason: safeValue(field(form, "reason")),
          notes: safeValue(field(form, "notes")),
        },
      });
      form.reset();
      const reason = field(form, "reason");
      if (reason) reason.value = "Admin adjustment";
      await loadBooks();
      setStatus("#inventoryStatus", "Inventory updated.", true);
    } catch (error) {
      setStatus("#inventoryStatus", error.message || "Inventory could not be updated.", false);
    }
  }


  async function loadBooks() {
    const data = await api("books");
    state.books = Array.isArray(data.books) ? data.books : [];
    renderBooks();
  }

  async function loadOrders() {
    const data = await api("orders");
    state.orders = Array.isArray(data.orders) ? data.orders : [];
    renderStoreOrders();
    renderStoreMetrics();
  }


  qs("#setupBtn")?.addEventListener("click", function () {
    refreshCurrentPage().then(function () {
      window.alert("Publisher Store Manager is ready.");
    });
  });
  qs("#syncSquareStockBtn")?.addEventListener("click", async function () {
    const button = qs("#syncSquareStockBtn");
    if (button) { button.disabled = true; button.textContent = "Syncing..."; }
    try {
      const data = await api("inventory/sync-square", { method: "POST" });
      await loadBooks();
      window.alert("Square stock sync complete. " + (data.updated || 0) + " book(s) updated.");
    } catch (error) {
      window.alert(error.message || "Square stock sync failed.");
    } finally {
      if (button) { button.disabled = false; button.textContent = "Sync Square Stock"; }
    }
  });
  qs("#newBookBtn")?.addEventListener("click", resetBookForm);
  qs("#cancelBookBtn")?.addEventListener("click", resetBookForm);
  qs("#duplicateBookBtn")?.addEventListener("click", function () {
    const bookId = safeValue(field(qs("#bookForm"), "bookId"));
    if (bookId) duplicateBookRow(bookId);
    else window.alert("Save the book first.");
  });
  qs("#removeBookImageBtn")?.addEventListener("click", removeCurrentBookImage);
  qs("#publishBtn")?.addEventListener("click", publishCurrentBook);
  qs("#archiveBtn")?.addEventListener("click", archiveCurrentBook);
  qs('#bookForm select[name="format"]')?.addEventListener("change", syncBookFormatPrice);
  qs("#bookForm")?.addEventListener("submit", saveBook);
  syncBookFormatPrice();
  qs("#orderForm")?.addEventListener("submit", updateOrder);
  qs("#inventoryForm")?.addEventListener("submit", adjustInventory);

  qs("#ordersSearch")?.addEventListener("input", function (event) {
    state.orderFilters.search = event.target.value || "";
    renderStoreOrders();
  });
  qs("#ordersPaymentFilter")?.addEventListener("change", function (event) {
    state.orderFilters.payment = event.target.value || "";
    renderStoreOrders();
  });
  qs("#ordersFulfillmentFilter")?.addEventListener("change", function (event) {
    state.orderFilters.fulfillment = event.target.value || "";
    renderStoreOrders();
  });
  qs("#ordersSort")?.addEventListener("change", function (event) {
    state.orderFilters.sort = event.target.value || "date-desc";
    renderStoreOrders();
  });
  qs("#bookSearch")?.addEventListener("input", function (event) {
    state.bookFilters.search = event.target.value || "";
    renderBooks();
  });
  qs("#bookStatusFilter")?.addEventListener("change", function (event) {
    state.bookFilters.status = event.target.value || "";
    renderBooks();
  });
  qs("#bookSort")?.addEventListener("change", function (event) {
    state.bookFilters.sort = event.target.value || "updated-desc";
    renderBooks();
  });
  qs("#inventorySearch")?.addEventListener("input", function (event) {
    state.inventoryFilters.search = event.target.value || "";
    renderInventory();
  });
  qs("#inventoryStatusFilter")?.addEventListener("change", function (event) {
    state.inventoryFilters.status = event.target.value || "";
    renderInventory();
  });
  qs("#inventoryHealthFilter")?.addEventListener("change", function (event) {
    state.inventoryFilters.health = event.target.value || "";
    renderInventory();
  });
  qs("#inventorySort")?.addEventListener("change", function (event) {
    state.inventoryFilters.sort = event.target.value || "updated-desc";
    renderInventory();
  });

  qs("#bookImage")?.addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const preview = qs("#imagePreview");
      if (preview) preview.innerHTML = '<img src="' + escapeHtml(reader.result) + '" alt="">';
    };
    reader.readAsDataURL(file);
  });

document.addEventListener("click", function (event) {
    const storeTab = event.target.closest("[data-store-tab]");
    if (storeTab) {
      showStoreView(storeTab.getAttribute("data-store-tab"));
      if (state.page === "store") {
        window.history.replaceState(null, "", "#" + storeTab.getAttribute("data-store-tab"));
      }
      return;
    }

    const editBookButton = event.target.closest("[data-edit-book]");
    if (editBookButton) {
      populateBookForm(
        state.books.find(function (book) {
          return book.bookId === editBookButton.getAttribute("data-edit-book");
        }),
      );
      return;
    }

    const deleteBookButton = event.target.closest("[data-delete-book]");
    if (deleteBookButton) {
      deleteBookRow(deleteBookButton.getAttribute("data-delete-book"));
      return;
    }

    const duplicateBookButton = event.target.closest("[data-duplicate-book]");
    if (duplicateBookButton) {
      duplicateBookRow(duplicateBookButton.getAttribute("data-duplicate-book"));
      return;
    }
});


bulkConfigs.books = {
  singular: "book",
  plural: "books",
  endpoint: function (id) { return "books/" + encodeURIComponent(id); },
  load: loadBooks,
  status: "#bookStatus",
  note: "Books with order or inventory history will be archived instead of permanently deleted.",
};
pageLoaders.store = async function () {
  await Promise.all([loadBooks(), loadOrders()]);
  showStoreView(window.location.hash.replace(/^#/, "") || "overview");
};