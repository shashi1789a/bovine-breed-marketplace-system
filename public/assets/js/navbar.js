/* ============================================
   DAIRYKHATA — NAVBAR JS
   Sticky nav, scroll shrink, mobile menu
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {

  const navbar = document.querySelector('.navbar');

  // ---- 1. Scroll shrink effect ----
  function handleScroll() {
    if (!navbar) return;
    if (window.scrollY > 80) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll(); // run on page load

  // ---- 2. Active nav link highlight ----
  const navLinks = document.querySelectorAll('.navbar-nav .nav-link:not(.dropdown-toggle)');
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';

  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href && (href === currentPath || href.endsWith(currentPath))) {
      link.classList.add('active');
    }
  });

  // ---- 3. Close mobile menu on nav link click ----
  const navbarCollapse = document.getElementById('navbarMain');
  if (navbarCollapse) {
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        const bsCollapse = bootstrap.Collapse.getInstance(navbarCollapse);
        if (bsCollapse) bsCollapse.hide();
      });
    });
  }

  // ---- 4. Dropdown keyboard accessibility ----
  document.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') item.click();
    });
  });

});
