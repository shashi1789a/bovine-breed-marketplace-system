/* ============================================
   DAIRYKHATA — ANIMATIONS JS
   Custom keyframe triggers & scroll effects
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {

  // ---- 1. Staggered card animations on scroll ----
  const staggerGroups = document.querySelectorAll('[data-stagger]');
  staggerGroups.forEach(group => {
    Array.from(group.children).forEach((child, i) => {
      child.setAttribute('data-aos', 'fade-up');
      child.setAttribute('data-aos-delay', String(i * 80));
    });
  });

  // ---- 2. Progress bar animations ----
  const progressBars = document.querySelectorAll('.progress-bar[data-width]');
  if (progressBars.length) {
    const progressObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const bar = entry.target;
          bar.style.width = bar.getAttribute('data-width') + '%';
          progressObserver.unobserve(bar);
        }
      });
    }, { threshold: 0.4 });
    progressBars.forEach(bar => {
      bar.style.width = '0%';
      bar.style.transition = 'width 1.4s cubic-bezier(0.4,0,0.2,1)';
      progressObserver.observe(bar);
    });
  }

  // ---- 3. Hero orb subtle interaction ----
  const heroOrbs = document.querySelectorAll('.hero-orb');
  heroOrbs.forEach(orb => {
    orb.addEventListener('mouseover', () => {
      orb.style.animationPlayState = 'paused';
      orb.style.filter = 'blur(45px)';
    });
    orb.addEventListener('mouseout', () => {
      orb.style.animationPlayState = 'running';
      orb.style.filter = 'blur(70px)';
    });
  });

  // ---- 4. Step number pulse on scroll ----
  const stepNumbers = document.querySelectorAll('.step-number');
  if (stepNumbers.length) {
    const stepObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('step-pulse'), i * 150);
          stepObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    stepNumbers.forEach(step => stepObserver.observe(step));
  }

  // ---- 5. Icon micro-interaction on card hover ----
  const cardSelectors = '.feature-card, .module-card, .benefit-card, .audience-card, .stat-card, .contact-card, .team-card';
  document.querySelectorAll(cardSelectors).forEach(card => {
    card.addEventListener('mouseenter', () => {
      const icon = card.querySelector('.fc-icon, .card-icon, .stat-icon, .contact-icon, .audience-icon');
      if (icon) {
        icon.style.transition = 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)';
        icon.style.transform = 'scale(1.18) rotate(-6deg)';
        setTimeout(() => { icon.style.transform = ''; }, 260);
      }
    });
  });

  // ---- 6. Scroll reveal for section headings ----
  document.querySelectorAll('.section-title:not([data-aos])').forEach(h => {
    h.setAttribute('data-aos', 'fade-up');
    h.setAttribute('data-aos-duration', '600');
  });

  // Refresh AOS after dynamic attribute assignment
  if (typeof AOS !== 'undefined') {
    AOS.refreshHard();
  }

  // ---- 7. Back to Top scroll trigger ----
  const backToTopBtn = document.getElementById('backToTop');
  if (backToTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 400) {
        backToTopBtn.classList.add('show');
      } else {
        backToTopBtn.classList.remove('show');
      }
    }, { passive: true });

    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ---- 8. Pricing toggle card transition ----
  const pricingToggle = document.getElementById('pricingToggle');
  if (pricingToggle) {
    pricingToggle.addEventListener('change', () => {
      document.querySelectorAll('.pricing-card').forEach(card => {
        card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        card.style.opacity = '0.7';
        card.style.transform = 'scale(0.98)';
        setTimeout(() => {
          card.style.opacity = '';
          card.style.transform = '';
        }, 220);
      });
    });
  }

  // ---- 9. Smooth link transition for footer links ----
  document.querySelectorAll('footer a').forEach(link => {
    link.style.transition = 'color 0.25s ease';
  });

});
