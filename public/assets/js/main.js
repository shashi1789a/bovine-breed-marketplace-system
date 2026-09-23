/* ============================================
   DAIRYKHATA — MAIN JS
   AOS Init, CountUp, Stats Observer
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {

  // ---- 1. AOS (Animate on Scroll) Init ----
  AOS.init({
    duration: 700,
    easing: 'ease-out-cubic',
    once: true,
    offset: 80,
    delay: 0,
  });

  // ---- 2. CountUp — Animated Stats Counter ----
  const statsData = [
    { el: document.getElementById('count-farmers'),   end: 1000,  suffix: '+' },
    { el: document.getElementById('count-dealers'),   end: 1147,  suffix: '+' },
    { el: document.getElementById('count-downloads'), end: 10000, suffix: '+' },
    { el: document.getElementById('count-rating'),    end: 4.9,   suffix: '★', decimals: 1 },
  ];

  function runCountUp() {
    statsData.forEach(({ el, end, suffix, decimals = 0 }) => {
      if (!el) return;
      const counter = new countUp.CountUp(el, end, {
        duration: 2.5,
        suffix: suffix,
        decimalPlaces: decimals,
        useEasing: true,
        useGrouping: true,
      });
      if (!counter.error) counter.start();
    });
  }

  // ---- 3. IntersectionObserver — trigger CountUp when stats in view ----
  const statsSection = document.getElementById('stats-section');
  if (statsSection) {
    let counted = false;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !counted) {
          counted = true;
          runCountUp();
        }
      });
    }, { threshold: 0.3 });
    observer.observe(statsSection);
  }

  // ---- 4. Swiper — App Preview (exactly 5 phones, centered, loop) ----
  const appPreviewEl = document.querySelector('.app-preview-swiper');
  if (appPreviewEl) {
    new Swiper('.app-preview-swiper', {
      slidesPerView: 5,
      centeredSlides: true,
      spaceBetween: 16,
      loop: true,
      mousewheel: {
        forceToAxis: true,
        sensitivity: 1,
        releaseOnEdges: false,
      },
      navigation: {
        nextEl: '.app-next',
        prevEl: '.app-prev',
      },
      pagination: {
        el: '.app-preview-pagination',
        clickable: true,
      },
      breakpoints: {
        0:   { slidesPerView: 1, spaceBetween: 12 },
        480: { slidesPerView: 3, spaceBetween: 14 },
        768: { slidesPerView: 3, spaceBetween: 14 },
        992: { slidesPerView: 5, spaceBetween: 16 },
      },
    });
  }

  // ---- 5. Swiper — Testimonials Carousel ----
  const testimonialEl = document.querySelector('.swiper-testimonials');
  if (testimonialEl) {
    new Swiper('.swiper-testimonials', {
      slidesPerView: 1,
      spaceBetween: 24,
      loop: true,
      autoplay: {
        delay: 4500,
        disableOnInteraction: false,
      },
      pagination: {
        el: '.swiper-pagination',
        clickable: true,
      },
      navigation: {
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev',
      },
      breakpoints: {
        640:  { slidesPerView: 1, spaceBetween: 20 },
        768:  { slidesPerView: 2, spaceBetween: 24 },
        1024: { slidesPerView: 3, spaceBetween: 28 },
      },
    });
  }

  // ---- 5. Pricing Toggle — Monthly / Annual ----
  const pricingToggle = document.getElementById('pricingToggle');
  if (pricingToggle) {
    const monthlyPrices  = document.querySelectorAll('.price-monthly');
    const annualPrices   = document.querySelectorAll('.price-annual');
    const periodLabels   = document.querySelectorAll('.price-period');

    pricingToggle.addEventListener('change', () => {
      const isAnnual = pricingToggle.checked;
      monthlyPrices.forEach(el  => el.classList.toggle('d-none', isAnnual));
      annualPrices.forEach(el   => el.classList.toggle('d-none', !isAnnual));
      periodLabels.forEach(el   => el.textContent = isAnnual ? '/year' : '/month');
    });
  }

  // ---- 6. Smooth scroll for anchor links ----
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = 80;
        const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // ---- 7. Back to Top Button ----
  const backToTop = document.getElementById('backToTop');
  if (backToTop) {
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('show', window.scrollY > 400);
    });
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ---- 8. Bootstrap Form Validation (needs-validation forms) ----
  document.querySelectorAll('form.needs-validation').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!form.checkValidity()) {
        e.preventDefault();
        e.stopPropagation();
        // Focus first invalid field
        const firstInvalid = form.querySelector(':invalid');
        if (firstInvalid) firstInvalid.focus();
      } else {
        // If form has a real action (not "#"), allow native submit
        if (form.getAttribute('action') && form.getAttribute('action') !== '#') {
          // Let the form submit naturally to its action URL
          return;
        }
        e.preventDefault();
        // Show success state on all required fields
        form.querySelectorAll('[required]').forEach(el => {
          el.classList.remove('is-invalid');
          el.classList.add('is-valid');
        });
        // Show success message
        const btn = form.querySelector('[type="submit"]');
        if (btn) {
          const original = btn.innerHTML;
          btn.innerHTML = '<i class="fas fa-check me-2"></i> Submitted Successfully!';
          btn.disabled = true;
          btn.style.background = 'linear-gradient(135deg,#2E7D32,#4CAF50)';
          setTimeout(() => {
            btn.innerHTML = original;
            btn.disabled = false;
            btn.style.background = '';
            form.reset();
            form.querySelectorAll('.is-valid,.is-invalid').forEach(el => {
              el.classList.remove('is-valid', 'is-invalid');
            });
            form.classList.remove('was-validated');
          }, 3000);
        }
      }
      form.classList.add('was-validated');
    });

    // Live validation: mark field valid/invalid on blur
    form.querySelectorAll('[required]').forEach(function (field) {
      field.addEventListener('blur', function () {
        if (field.checkValidity()) {
          field.classList.remove('is-invalid');
          field.classList.add('is-valid');
        } else {
          field.classList.remove('is-valid');
          field.classList.add('is-invalid');
        }
      });
      // Clear invalid on input
      field.addEventListener('input', function () {
        if (field.checkValidity()) {
          field.classList.remove('is-invalid');
          field.classList.add('is-valid');
        }
      });
    });
  });

  // ---- 9. Footer Newsletter ----
  const newsletterBtn = document.querySelector('.footer-subscribe-btn');
  const newsletterInput = document.querySelector('.footer-email-input');
  if (newsletterBtn && newsletterInput) {
    newsletterBtn.addEventListener('click', function () {
      const email = newsletterInput.value.trim();
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!valid) {
        newsletterInput.style.borderColor = '#e53935';
        newsletterInput.focus();
        return;
      }
      newsletterInput.style.borderColor = '#4CAF50';
      newsletterBtn.innerHTML = '<i class="fas fa-check"></i>';
      newsletterBtn.disabled = true;
      setTimeout(() => {
        newsletterInput.value = '';
        newsletterInput.style.borderColor = '';
        newsletterBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        newsletterBtn.disabled = false;
      }, 3000);
    });
    newsletterInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') newsletterBtn.click();
    });
  }

});
