/* ══════════════════════════════════════
   landing.js — Laksa Landing Page Script
   ══════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Smart Redirect: Only redirect if user has a REAL auth token (not demo data)
  const token = localStorage.getItem('laksa_token');
  // Always clear any leftover demo session so clicking "Masuk" goes to login, not demo
  sessionStorage.removeItem('laksa_demo');
  if (token) {
    window.location.href = '/app.html#/dashboard';
    return;
  }

  // 2. Smooth scrolling for internal anchor links (e.g. Fitur, Harga, FAQ)
  const menuLinks = document.querySelectorAll('.landing-menu a, .landing-footer-col a[href^="#"], .landing-hero-ctas a[href^="#"], .mobile-menu-nav a[href^="#"]');
  menuLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId.startsWith('#')) {
        e.preventDefault();
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          targetEl.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
        // If it's a mobile menu link, close the menu after clicking
        if (link.classList.contains('mobile-menu-link')) {
          closeMobileMenu();
        }
      }
    });
  });

  // 3. Mobile Menu Toggle Logic
  const burgerBtn = document.getElementById('landingBurger');
  const closeBtn = document.getElementById('mobileMenuClose');
  const mobileMenu = document.getElementById('mobileMenu');
  const overlay = document.getElementById('mobileMenuOverlay');

  const openMobileMenu = () => {
    if (mobileMenu && overlay && burgerBtn) {
      mobileMenu.classList.add('active');
      overlay.classList.add('active');
      burgerBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
  };

  const closeMobileMenu = () => {
    if (mobileMenu && overlay && burgerBtn) {
      mobileMenu.classList.remove('active');
      overlay.classList.remove('active');
      burgerBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = ''; // Restore scrolling
    }
  };

  if (burgerBtn) burgerBtn.addEventListener('click', openMobileMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMobileMenu);
  if (overlay) overlay.addEventListener('click', closeMobileMenu);

});

