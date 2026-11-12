import { SectionHead, Section } from './layout/Section';
import { HeroVideo } from './HeroVideo';

/**
 * The one-minute film on its own section right under the hero: the heading and one line, then the film
 * across the whole wrap so its edges are the page's edges.
 */
export function Film() {
  return (
    <Section id="film" labelledBy="film-title" tone="paper">
      <SectionHead
        title={
          <h2 id="film-title" className="h2">
            See GymFlow in one minute
          </h2>
        }
        lead="How gyms are run today, then the GymFlow owner console and the member app."
      />
      <HeroVideo />
    </Section>
  );
}
