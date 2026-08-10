(() => {
  'use strict';

  const token = () => localStorage.getItem('laksa_token');
  let bellButton = null;
  let nextCursor = null;

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
    if (!response.ok) throw new Error('Operasi gagal');
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
        badge.textContent = data.count > 99 ? '99+' : String(data.count || '');
        badge.style.display = data.count ? 'grid' : 'none';
      }
    } catch {}
  }

  async function deleteOne(id, rowDiv) {
    try {
      await call(`/notifications/${encodeURIComponent(id)}`, 'DELETE');
      rowDiv.remove();
      const list = document.querySelector('.notification-list');
      if (list && !list.querySelector('.notification-item-wrap')) {
        list.textContent = 'Belum ada notifikasi.';
      }
      updateBadge();
    } catch (error) {
      alert('Gagal menghapus notifikasi');
    }
  }

  async function clearAll() {
    if (!confirm('Hapus semua notifikasi Anda secara permanen?')) return;
    try {
      await call('/notifications', 'DELETE');
      const list = document.querySelector('.notification-list');
      if (list) list.textContent = 'Belum ada notifikasi.';
      const loadMore = document.getElementById('notificationLoadMore');
      if (loadMore) loadMore.remove();
      updateBadge();
    } catch (error) {
      alert('Gagal membersihkan notifikasi');
    }
  }

  async function loadMoreNotifications(btn) {
    if (!nextCursor) return;
    btn.disabled = true;
    btn.textContent = 'Memuat…';
    try {
      const data = await call(`/notifications?cursor=${encodeURIComponent(nextCursor)}`);
      btn.remove();
      const list = document.querySelector('.notification-list');
      if (list) {
        appendItems(list, data.notifications || []);
        if (data.next_cursor) {
          nextCursor = data.next_cursor;
          addLoadMore(list);
        } else {
          nextCursor = null;
        }
      }
    } catch (error) {
      btn.disabled = false;
      btn.textContent = 'Coba Lagi';
    }
  }

  function addLoadMore(listContainer) {
    const btn = node('button', 'notification-load-more', 'Muat Lebih Banyak');
    btn.id = 'notificationLoadMore';
    btn.addEventListener('click', () => loadMoreNotifications(btn));
    listContainer.after(btn);
  }

  function appendItems(listContainer, notifications) {
    for (const item of notifications) {
      const wrap = node('div', 'notification-item-wrap');

      const card = node('button', `notification-item${item.read_at ? '' : ' unread'}`);
      card.append(node('b', '', item.title));
      card.append(node('span', '', item.message));
      card.append(node('small', '', new Date(item.created_at).toLocaleString('id-ID')));
      card.addEventListener('click', async () => {
        try {
          if (!item.read_at) {
            await call(`/notifications/${encodeURIComponent(item.id)}/read`, 'POST');
            card.classList.remove('unread');
            updateBadge();
          }
          if (item.entity_type === 'payment') {
            location.assign(`/checkout?order=${encodeURIComponent(item.entity_id)}&view=receipt`);
          }
        } catch (error) {
          alert('Gagal membaca notifikasi');
        }
      });

      const delBtn = node('button', 'notification-delete', '×');
      delBtn.type = 'button';
      delBtn.setAttribute('aria-label', 'Hapus notifikasi');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteOne(item.id, wrap);
      });

      wrap.append(card, delBtn);
      listContainer.append(wrap);
    }
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
    const markAll = node('button', 'notification-read-all', 'Tandai dibaca');
    const clearAllBtn = node('button', 'notification-clear-all', 'Hapus semua');
    const close = node('button', 'notification-close', '×');

    close.type = 'button';
    close.setAttribute('aria-label', 'Tutup notifikasi');
    close.addEventListener('click', closeNotifications);

    headerActions.append(markAll, clearAllBtn, close);
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

    clearAllBtn.addEventListener('click', clearAll);

    try {
      const data = await call('/notifications');
      list.textContent = '';
      appendItems(list, data.notifications || []);

      if (data.next_cursor) {
        nextCursor = data.next_cursor;
        addLoadMore(list);
      } else {
        nextCursor = null;
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
