-- Published catalog metadata only. Preserve real stock; never invent inventory.

-- Populate physical counts through Admin Store before enabling direct sales.

UPDATE books SET featured = 0 WHERE featured = 1;

UPDATE books SET isbn = '1972028022', title = 'The Adventures of D.D. & Reuel: The Great Pie Mystery', author = 'Barbara J. Ratliff', synopsis = 'Something mysterious is happening in Pleasantville, and two young detectives are determined to get to the bottom of it!

When a very special pie mysteriously disappears, D.D. and Reuel set out on an adventure filled with clues, unexpected discoveries, family, and plenty of laughter.

With curiosity leading the way, the young detectives soon discover that solving a mystery takes more than finding answers—it takes teamwork, courage, and a little imagination.

One missing pie. Two determined detectives. An adventure you won''t want to miss!', short_description = 'Something mysterious is happening in Pleasantville, and two young detectives are determined to get to the bottom of it!', format = 'Paperback', category = 'Children’s Mystery', price = '20', image_url = '/assets/books/pieMystery.png', featured = '0', coming_soon = '0', preorder = '0', publication_date = '2026-11-04', notification_title = 'The Adventures of D.D. & Reuel: The Great Pie Mystery', status = CASE WHEN stock > 0 THEN 'Published' ELSE 'Out of Stock' END, updated_at = datetime('now') WHERE format = 'Paperback' AND (REPLACE(isbn, '-', '') IN ('1972028022', '9781972028025') OR (lower(title) LIKE '%great pie mystery%'));

INSERT INTO books (id, sku, isbn, title, author, synopsis, short_description, format, category, price, image_url, featured, coming_soon, preorder, publication_date, notification_title, stock, status) SELECT 'jpp-1972028022', 'JPP-1972028022', '1972028022', 'The Adventures of D.D. & Reuel: The Great Pie Mystery', 'Barbara J. Ratliff', 'Something mysterious is happening in Pleasantville, and two young detectives are determined to get to the bottom of it!

When a very special pie mysteriously disappears, D.D. and Reuel set out on an adventure filled with clues, unexpected discoveries, family, and plenty of laughter.

With curiosity leading the way, the young detectives soon discover that solving a mystery takes more than finding answers—it takes teamwork, courage, and a little imagination.

One missing pie. Two determined detectives. An adventure you won''t want to miss!', 'Something mysterious is happening in Pleasantville, and two young detectives are determined to get to the bottom of it!', 'Paperback', 'Children’s Mystery', '20', '/assets/books/pieMystery.png', '0', '0', '0', '2026-11-04', 'The Adventures of D.D. & Reuel: The Great Pie Mystery', '0', 'Out of Stock' WHERE NOT EXISTS (SELECT 1 FROM books WHERE format = 'Paperback' AND (REPLACE(isbn, '-', '') IN ('1972028022', '9781972028025') OR (lower(title) LIKE '%great pie mystery%')));

UPDATE books SET isbn = '1972028324', title = 'The Adventures of D.D. & Reuel: The Great Pie Mystery', author = 'Barbara J. Ratliff', synopsis = 'Something mysterious is happening in Pleasantville, and two young detectives are determined to get to the bottom of it!

When a very special pie mysteriously disappears, D.D. and Reuel set out on an adventure filled with clues, unexpected discoveries, family, and plenty of laughter.

With curiosity leading the way, the young detectives soon discover that solving a mystery takes more than finding answers—it takes teamwork, courage, and a little imagination.

One missing pie. Two determined detectives. An adventure you won''t want to miss!', short_description = 'Something mysterious is happening in Pleasantville, and two young detectives are determined to get to the bottom of it!', format = 'Hardcover', category = 'Children’s Mystery', price = '25', image_url = '/assets/books/pieMystery.png', featured = '0', coming_soon = '0', preorder = '0', publication_date = '2026-11-04', notification_title = 'The Adventures of D.D. & Reuel: The Great Pie Mystery', status = CASE WHEN stock > 0 THEN 'Published' ELSE 'Out of Stock' END, updated_at = datetime('now') WHERE format = 'Hardcover' AND (REPLACE(isbn, '-', '') IN ('1972028324', '9781972028322') OR (lower(title) LIKE '%great pie mystery%'));

INSERT INTO books (id, sku, isbn, title, author, synopsis, short_description, format, category, price, image_url, featured, coming_soon, preorder, publication_date, notification_title, stock, status) SELECT 'jpp-1972028324', 'JPP-1972028324', '1972028324', 'The Adventures of D.D. & Reuel: The Great Pie Mystery', 'Barbara J. Ratliff', 'Something mysterious is happening in Pleasantville, and two young detectives are determined to get to the bottom of it!

When a very special pie mysteriously disappears, D.D. and Reuel set out on an adventure filled with clues, unexpected discoveries, family, and plenty of laughter.

With curiosity leading the way, the young detectives soon discover that solving a mystery takes more than finding answers—it takes teamwork, courage, and a little imagination.

One missing pie. Two determined detectives. An adventure you won''t want to miss!', 'Something mysterious is happening in Pleasantville, and two young detectives are determined to get to the bottom of it!', 'Hardcover', 'Children’s Mystery', '25', '/assets/books/pieMystery.png', '0', '0', '0', '2026-11-04', 'The Adventures of D.D. & Reuel: The Great Pie Mystery', '0', 'Out of Stock' WHERE NOT EXISTS (SELECT 1 FROM books WHERE format = 'Hardcover' AND (REPLACE(isbn, '-', '') IN ('1972028324', '9781972028322') OR (lower(title) LIKE '%great pie mystery%')));

UPDATE books SET isbn = '1972028014', title = 'The Fading Lighthouse – Battles Beyond the Waves, Book II', author = 'Barbara J. Ratliff', synopsis = 'Some battles are fought in uniform. Others begin when the uniform comes off.

In this deeply personal continuation of Battles Beyond the Waves, Barbara J. Ratliff explores the challenges of life beyond military service, the weight of personal struggles, and the courage it takes to keep moving forward when the path becomes uncertain.

Through honest reflection, resilience, and faith, The Fading Lighthouse reminds readers that even when life''s light seems to grow dim, hope can still guide us toward a brighter tomorrow.

A powerful story of perseverance, healing, and finding strength beyond the waves.', short_description = 'Some battles are fought in uniform. Others begin when the uniform comes off.', format = 'Paperback', category = 'Military Memoir / Nonfiction', price = '20', image_url = '/assets/books/battles2.png', featured = '0', coming_soon = '0', preorder = '0', publication_date = '2026-10-20', notification_title = 'The Fading Lighthouse – Battles Beyond the Waves, Book II', status = CASE WHEN stock > 0 THEN 'Published' ELSE 'Out of Stock' END, updated_at = datetime('now') WHERE format = 'Paperback' AND (REPLACE(isbn, '-', '') IN ('1972028014', '9781972028018') OR (lower(title) LIKE '%fading lighthouse%'));

INSERT INTO books (id, sku, isbn, title, author, synopsis, short_description, format, category, price, image_url, featured, coming_soon, preorder, publication_date, notification_title, stock, status) SELECT 'jpp-1972028014', 'JPP-1972028014', '1972028014', 'The Fading Lighthouse – Battles Beyond the Waves, Book II', 'Barbara J. Ratliff', 'Some battles are fought in uniform. Others begin when the uniform comes off.

In this deeply personal continuation of Battles Beyond the Waves, Barbara J. Ratliff explores the challenges of life beyond military service, the weight of personal struggles, and the courage it takes to keep moving forward when the path becomes uncertain.

Through honest reflection, resilience, and faith, The Fading Lighthouse reminds readers that even when life''s light seems to grow dim, hope can still guide us toward a brighter tomorrow.

A powerful story of perseverance, healing, and finding strength beyond the waves.', 'Some battles are fought in uniform. Others begin when the uniform comes off.', 'Paperback', 'Military Memoir / Nonfiction', '20', '/assets/books/battles2.png', '0', '0', '0', '2026-10-20', 'The Fading Lighthouse – Battles Beyond the Waves, Book II', '0', 'Out of Stock' WHERE NOT EXISTS (SELECT 1 FROM books WHERE format = 'Paperback' AND (REPLACE(isbn, '-', '') IN ('1972028014', '9781972028018') OR (lower(title) LIKE '%fading lighthouse%')));

UPDATE books SET isbn = '1972028316', title = 'The Fading Lighthouse – Battles Beyond the Waves, Book II', author = 'Barbara J. Ratliff', synopsis = 'Some battles are fought in uniform. Others begin when the uniform comes off.

In this deeply personal continuation of Battles Beyond the Waves, Barbara J. Ratliff explores the challenges of life beyond military service, the weight of personal struggles, and the courage it takes to keep moving forward when the path becomes uncertain.

Through honest reflection, resilience, and faith, The Fading Lighthouse reminds readers that even when life''s light seems to grow dim, hope can still guide us toward a brighter tomorrow.

A powerful story of perseverance, healing, and finding strength beyond the waves.', short_description = 'Some battles are fought in uniform. Others begin when the uniform comes off.', format = 'Hardcover', category = 'Military Memoir / Nonfiction', price = '25', image_url = '/assets/books/battles2.png', featured = '0', coming_soon = '0', preorder = '0', publication_date = '2026-10-20', notification_title = 'The Fading Lighthouse – Battles Beyond the Waves, Book II', status = CASE WHEN stock > 0 THEN 'Published' ELSE 'Out of Stock' END, updated_at = datetime('now') WHERE format = 'Hardcover' AND (REPLACE(isbn, '-', '') IN ('1972028316', '9781972028315') OR (lower(title) LIKE '%fading lighthouse%'));

INSERT INTO books (id, sku, isbn, title, author, synopsis, short_description, format, category, price, image_url, featured, coming_soon, preorder, publication_date, notification_title, stock, status) SELECT 'jpp-1972028316', 'JPP-1972028316', '1972028316', 'The Fading Lighthouse – Battles Beyond the Waves, Book II', 'Barbara J. Ratliff', 'Some battles are fought in uniform. Others begin when the uniform comes off.

In this deeply personal continuation of Battles Beyond the Waves, Barbara J. Ratliff explores the challenges of life beyond military service, the weight of personal struggles, and the courage it takes to keep moving forward when the path becomes uncertain.

Through honest reflection, resilience, and faith, The Fading Lighthouse reminds readers that even when life''s light seems to grow dim, hope can still guide us toward a brighter tomorrow.

A powerful story of perseverance, healing, and finding strength beyond the waves.', 'Some battles are fought in uniform. Others begin when the uniform comes off.', 'Hardcover', 'Military Memoir / Nonfiction', '25', '/assets/books/battles2.png', '0', '0', '0', '2026-10-20', 'The Fading Lighthouse – Battles Beyond the Waves, Book II', '0', 'Out of Stock' WHERE NOT EXISTS (SELECT 1 FROM books WHERE format = 'Hardcover' AND (REPLACE(isbn, '-', '') IN ('1972028316', '9781972028315') OR (lower(title) LIKE '%fading lighthouse%')));

UPDATE books SET isbn = '1972028006', title = 'Battles Beyond the Waves – Book I', author = 'Barbara J. Ratliff', synopsis = 'A story of a Sailor, a survivor, and a woman whose faith was tested far beyond the waves.

Barbara J. Ratliff takes readers beyond the uniform and into the deeply personal battles that shaped her journey in the United States Navy. What begins as a young woman''s determination to build a life through military service becomes a story of sacrifice, motherhood, betrayal, perseverance, and faith.

With candor and reflection, Battles Beyond the Waves reveals what can happen when the institution you have pledged to serve becomes part of the battle itself, and what it takes to keep moving forward when some wounds cannot be seen.

More than a military memoir, it is a story about finding the strength to survive, the faith to endure, and the courage to tell the truth.', short_description = 'A story of a Sailor, a survivor, and a woman whose faith was tested far beyond the waves.', format = 'Paperback', category = 'Military Memoir / Nonfiction', price = '20', image_url = '/assets/books/battles1.png', featured = '0', coming_soon = '0', preorder = '0', publication_date = '2026-05-29', notification_title = 'Battles Beyond the Waves – Book I', status = CASE WHEN stock > 0 THEN 'Published' ELSE 'Out of Stock' END, updated_at = datetime('now') WHERE format = 'Paperback' AND (REPLACE(isbn, '-', '') IN ('1972028006', '9781972028001') OR (lower(title) LIKE '%battles beyond the waves%' AND lower(title) NOT LIKE '%fading lighthouse%' AND lower(title) NOT LIKE '%book ii%'));

INSERT INTO books (id, sku, isbn, title, author, synopsis, short_description, format, category, price, image_url, featured, coming_soon, preorder, publication_date, notification_title, stock, status) SELECT 'jpp-1972028006', 'JPP-1972028006', '1972028006', 'Battles Beyond the Waves – Book I', 'Barbara J. Ratliff', 'A story of a Sailor, a survivor, and a woman whose faith was tested far beyond the waves.

Barbara J. Ratliff takes readers beyond the uniform and into the deeply personal battles that shaped her journey in the United States Navy. What begins as a young woman''s determination to build a life through military service becomes a story of sacrifice, motherhood, betrayal, perseverance, and faith.

With candor and reflection, Battles Beyond the Waves reveals what can happen when the institution you have pledged to serve becomes part of the battle itself, and what it takes to keep moving forward when some wounds cannot be seen.

More than a military memoir, it is a story about finding the strength to survive, the faith to endure, and the courage to tell the truth.', 'A story of a Sailor, a survivor, and a woman whose faith was tested far beyond the waves.', 'Paperback', 'Military Memoir / Nonfiction', '20', '/assets/books/battles1.png', '0', '0', '0', '2026-05-29', 'Battles Beyond the Waves – Book I', '0', 'Out of Stock' WHERE NOT EXISTS (SELECT 1 FROM books WHERE format = 'Paperback' AND (REPLACE(isbn, '-', '') IN ('1972028006', '9781972028001') OR (lower(title) LIKE '%battles beyond the waves%' AND lower(title) NOT LIKE '%fading lighthouse%' AND lower(title) NOT LIKE '%book ii%')));

UPDATE books SET isbn = '1972028308', title = 'Battles Beyond the Waves – Book I', author = 'Barbara J. Ratliff', synopsis = 'A story of a Sailor, a survivor, and a woman whose faith was tested far beyond the waves.

Barbara J. Ratliff takes readers beyond the uniform and into the deeply personal battles that shaped her journey in the United States Navy. What begins as a young woman''s determination to build a life through military service becomes a story of sacrifice, motherhood, betrayal, perseverance, and faith.

With candor and reflection, Battles Beyond the Waves reveals what can happen when the institution you have pledged to serve becomes part of the battle itself, and what it takes to keep moving forward when some wounds cannot be seen.

More than a military memoir, it is a story about finding the strength to survive, the faith to endure, and the courage to tell the truth.', short_description = 'A story of a Sailor, a survivor, and a woman whose faith was tested far beyond the waves.', format = 'Hardcover', category = 'Military Memoir / Nonfiction', price = '25', image_url = '/assets/books/battles1.png', featured = '0', coming_soon = '0', preorder = '0', publication_date = '2026-05-29', notification_title = 'Battles Beyond the Waves – Book I', status = CASE WHEN stock > 0 THEN 'Published' ELSE 'Out of Stock' END, updated_at = datetime('now') WHERE format = 'Hardcover' AND (REPLACE(isbn, '-', '') IN ('1972028308', '9781972028308') OR (lower(title) LIKE '%battles beyond the waves%' AND lower(title) NOT LIKE '%fading lighthouse%' AND lower(title) NOT LIKE '%book ii%'));

INSERT INTO books (id, sku, isbn, title, author, synopsis, short_description, format, category, price, image_url, featured, coming_soon, preorder, publication_date, notification_title, stock, status) SELECT 'jpp-1972028308', 'JPP-1972028308', '1972028308', 'Battles Beyond the Waves – Book I', 'Barbara J. Ratliff', 'A story of a Sailor, a survivor, and a woman whose faith was tested far beyond the waves.

Barbara J. Ratliff takes readers beyond the uniform and into the deeply personal battles that shaped her journey in the United States Navy. What begins as a young woman''s determination to build a life through military service becomes a story of sacrifice, motherhood, betrayal, perseverance, and faith.

With candor and reflection, Battles Beyond the Waves reveals what can happen when the institution you have pledged to serve becomes part of the battle itself, and what it takes to keep moving forward when some wounds cannot be seen.

More than a military memoir, it is a story about finding the strength to survive, the faith to endure, and the courage to tell the truth.', 'A story of a Sailor, a survivor, and a woman whose faith was tested far beyond the waves.', 'Hardcover', 'Military Memoir / Nonfiction', '25', '/assets/books/battles1.png', '0', '0', '0', '2026-05-29', 'Battles Beyond the Waves – Book I', '0', 'Out of Stock' WHERE NOT EXISTS (SELECT 1 FROM books WHERE format = 'Hardcover' AND (REPLACE(isbn, '-', '') IN ('1972028308', '9781972028308') OR (lower(title) LIKE '%battles beyond the waves%' AND lower(title) NOT LIKE '%fading lighthouse%' AND lower(title) NOT LIKE '%book ii%')));

UPDATE books SET featured = 1 WHERE id = (SELECT id FROM books WHERE isbn = '1972028022' AND format = 'Paperback' LIMIT 1);
