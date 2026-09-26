import gsap from 'gsap';
import { profile, projects } from '../data/portfolio';
import { icons } from './icons';
import {
  aboutHTML,
  achievementsHTML,
  certificationsHTML,
  contactButtons,
  projectCardHTML,
  skillsHTML,
} from './content';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A fast, fully accessible, scrollable version of the portfolio. */
export class ClassicView {
  private built = false;
  private observer?: IntersectionObserver;

  constructor(private el: HTMLElement, private onClose: () => void) {}

  private build() {
    const sections = [
      ['about', 'About'],
      ['skills', 'Skills'],
      ['projects', 'Projects'],
      ['achievements', 'Achievements'],
      ['certifications', 'Certifications'],
      ['contact', 'Contact'],
    ];
    this.el.innerHTML = `
      <div class="classic-scroll">
        <header class="classic-bar">
          <a class="brand" href="#classic-top"><span class="brand-mark">HA</span><span class="brand-text"><strong>${profile.name}</strong><small>Portfolio</small></span></a>
          <nav>${sections.map(([id, label]) => `<a href="#c-${id}">${label}</a>`).join('')}</nav>
          <button class="btn btn-primary btn-sm back-world">${icons.compass}<span>Explore 3D world</span></button>
        </header>

        <section class="classic-hero" id="classic-top">
          <div class="hero-glow"></div>
          <img class="hero-portrait" src="${import.meta.env.BASE_URL}profile.jpg" alt="${profile.name}" />
          <p class="eyebrow">${profile.location}</p>
          <h1><span>${profile.name}</span></h1>
          <p class="hero-role">${profile.role}</p>
          <p class="hero-intro">${profile.intro}</p>
          <div class="actions">
            <a class="btn btn-primary" href="mailto:${profile.email}">${icons.mail} Get in touch</a>
            <a class="btn btn-ghost" href="${profile.resume}" target="_blank" rel="noopener">${icons.download} Résumé</a>
            <a class="btn btn-ghost" href="${profile.github}" target="_blank" rel="noopener noreferrer">${icons.code} GitHub</a>
            <a class="btn btn-ghost" href="${profile.linkedin}" target="_blank" rel="noopener noreferrer">${icons.linkedin} LinkedIn</a>
          </div>
          <div class="hero-stats">
            <div><b>10+</b><span>Hackathon podiums</span></div>
            <div><b>76/76</b><span>Forgeries caught · PayProof</span></div>
            <div><b>~5M</b><span>Records analysed</span></div>
            <div><b>8.33</b><span>CGPA</span></div>
          </div>
        </section>

        <section class="classic-section" id="c-about"><h2 class="section-title"><small>01</small>About &amp; Education</h2>${aboutHTML()}</section>
        <section class="classic-section" id="c-skills"><h2 class="section-title"><small>02</small>Skills</h2>${skillsHTML()}</section>
        <section class="classic-section" id="c-projects"><h2 class="section-title"><small>03</small>Projects</h2>
          <div class="project-list two-col">${projects.map((p, i) => projectCardHTML(p, i, true)).join('')}</div>
        </section>
        <section class="classic-section" id="c-achievements"><h2 class="section-title"><small>04</small>Hackathons &amp; Achievements</h2>${achievementsHTML()}</section>
        <section class="classic-section" id="c-certifications"><h2 class="section-title"><small>05</small>Certifications</h2>${certificationsHTML()}</section>
        <section class="classic-section" id="c-contact"><h2 class="section-title"><small>06</small>Contact</h2>
          <p class="lead">Want to collaborate, hire me, or team up for the next hackathon? Reach out on any of these.</p>
          ${contactButtons()}
        </section>

        <footer class="classic-footer">
          <p>© ${new Date().getFullYear()} ${profile.name}. Built with Three.js, GSAP &amp; a lot of grass.</p>
          <p class="muted">Grass shading inspired by <a href="https://github.com/thebenezer/FluffyGrass" target="_blank" rel="noopener noreferrer">FluffyGrass</a> (MIT).</p>
        </footer>
      </div>`;

    this.el.querySelector('.back-world')!.addEventListener('click', () => this.onClose());
    this.el.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const target = this.el.querySelector(a.getAttribute('href')!.replace('#classic-top', '.classic-hero'));
        target?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      }),
    );
    this.built = true;
  }

  open() {
    if (!this.built) this.build();
    const scroller = this.el.querySelector<HTMLElement>('.classic-scroll')!;
    scroller.scrollTop = 0;
    if (reducedMotion) return;
    gsap.fromTo(this.el, { opacity: 0 }, { opacity: 1, duration: 0.45 });
    gsap.from(this.el.querySelectorAll('.classic-hero > *'), { y: 30, opacity: 0, stagger: 0.07, duration: 0.8, ease: 'power3.out', delay: 0.1 });

    this.observer?.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          this.observer!.unobserve(el);
          gsap.fromTo(el, { y: 36, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' });
        }
      },
      { root: scroller, threshold: 0.08 },
    );
    this.el
      .querySelectorAll<HTMLElement>('.section-title, .classic-section .lead, .skill-card, .project-card, .timeline-item, .cert-card, .contact-card, .edu-card, .stat-row')
      .forEach((n) => {
        n.style.opacity = '0';
        this.observer!.observe(n);
      });
  }

  close(done: () => void) {
    if (reducedMotion) return done();
    gsap.to(this.el, { opacity: 0, duration: 0.35, onComplete: done });
  }
}
