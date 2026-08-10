(() => {
  'use strict';

  const token = () => localStorage.getItem('laksa_token');
  let bellButton = null;

  async function call(path, method = 'GET') {
    const response = await fetch(`${CLOUD_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }
    });
    if (response.status === 401) {
      localStorage.removeItem('laksa_token');
      location.assign('/app.html#/login');
      throw new Error('Sesi berakhir');
    }
    if (!response.ok) throw new Error('Notifikasi tidak tersedia');
    return response.json();
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function closeNotifications() {
    document.getElementById('notificationPanel')?.remove();
    bellButton?.setAttribute('aria-expanded', 'false');
  }

  async function updateBadge() {
    if (!token()) return;
    try {
      const data = await call('/notifications/unread-count');
      const badge = document.getElementById('bellDot');
      if (badge) {
        badge.textContent = data.count > 9 ? '9+' : String(data.count || '');
        badge.style.display = data.count ? 'grid' : 'none';
      }
    } catch {}
  }

  async function openNotifications(event) {
    event?.stopPropagation();
    const existing = document.getElementById('notificationPanel');
    if (existing) {
      closeNotifications();
      return;
    }

    const panel = node('aside', 'notification-panel');
    panel.id = 'notificationPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Pusat notifikasi');

    const header = node('header', 'notification-head');
    header.append(node('h3', '', 'Notifikasi'));

    const headerActions = node('div', 'notification-head-actions');
    const markAll = node('button', 'notification-read-all', 'Tandai semua dibaca');
    const close = node('button', 'notification-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Tutup notifikasi');
    close.addEventListener('click', closeNotifications);
    headerActions.append(markAll, close);
    header.append(headerActions);
    panel.append(header);

    const list = node('div', 'notification-list', 'Memuat…');
    panel.append(list);
    panel.addEventListener('click', event => event.stopPropagation());
    document.body.append(panel);
    bellButton?.setAttribute('aria-expanded', 'true');

    markAll.addEventListener('click', async () => {
      try {
        await call('/notifications/read-all', 'POST');
        closeNotifications();
        await openNotifications();
        updateBadge();
      } catch (error) { list.textContent = error.message; }
    });

    try {
      const data = await call('/notifications');
      list.textContent = '';
      for (const item of data.notifications || []) {
        const card = node('button', `notification-item${item.read_at ? '' : ' unread'}`);
        card.append(node('b', '', item.title));
        card.append(node('span', '', item.message));
        card.append(node('small', '', new Date(item.created_at).toLocaleString('id-ID')));
        card.addEventListener('click', async () => {
          try {
            await call(`/notifications/${encodeURIComponent(item.id)}/read`, 'POST');
            if (item.entity_type === 'payment') {
              location.assign(`/checkout?order=${encodeURIComponent(item.entity_id)}&view=receipt`);
            }
          } catch (error) { list.textContent = error.message; }
        });
        list.append(card);
      }
      if (!list.children.length) list.textContent = 'Belum ada notifikasi.';
    } catch (error) { list.textContent = error.message; }
  }

  document.addEventListener('click', event => {
    const panel = document.getElementById('notificationPanel');
    if (panel && !panel.contains(event.target) && !bellButton?.contains(event.target)) closeNotifications();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeNotifications();
  });

  addEventListener('DOMContentLoaded', () => {
    bellButton = document.querySelector('.dash-action-btn.bell');
    if (bellButton) {
      bellButton.removeAttribute('onclick');
      bellButton.setAttribute('aria-expanded', 'false');
      bellButton.addEventListener('click', openNotifications);
    }
    updateBadge();
    setInterval(updateBadge, 60_000);
  });
})();
