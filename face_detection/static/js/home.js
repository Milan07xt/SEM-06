document.addEventListener("DOMContentLoaded", () => {
    // Scroll reveal using IntersectionObserver
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const elementsToAnimate = document.querySelectorAll(
        '.section-title, .feature-card, .step, .step-arrow, .stat-card, .quick-start-item, .cta h2, .cta p, .cta-buttons, .footer-section'
    );
    
    elementsToAnimate.forEach(el => {
        el.classList.add('reveal-on-scroll');
        observer.observe(el);
    });
});
