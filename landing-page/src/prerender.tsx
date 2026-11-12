import { renderToStaticMarkup } from 'react-dom/server'
import { Hero } from './components/Hero'
import { Film } from './components/Film'
import { Features } from './components/Features'
import { Problems } from './components/Problems'
import { WhatsAppSection } from './components/WhatsAppSection'
import { WhatsAppBubble } from './components/WhatsAppThread'
import { MESSAGE_TYPES } from './components/whatsappMessages'
import { Pricing } from './components/Pricing'
import { FAQ } from './components/FAQ'
import { CTA } from './components/CTA'
import { Footer } from './components/Footer'
import { getFeaturePage } from './data/featurePages'
import { ArticleFooter } from './pages/featureParts'

// Build-time only (see prerenderForCrawlers in vite.config.ts): the text React draws after load, as
// plain HTML, so crawlers that do not run JavaScript still read it. Same components as the live page,
// so the wording cannot drift. The hero is included for its description and dashboard mock text.
// BelowFoldSections is not used here: its staging reads `window`.
export function renderHomeSections(): string {
  return renderToStaticMarkup(
    <>
      <Hero />
      <Film />
      <Features />
      <Problems />
      <WhatsAppSection />
      {/* The phone cycles through these on a timer, so a static render only holds the first one. */}
      {MESSAGE_TYPES.slice(1).map(type => (
        <WhatsAppBubble key={type.id} message={type.message} />
      ))}
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </>,
  )
}

// What a feature page draws that its static copy lacks: prev/next, the closing call to action and
// the footer.
export function renderFeatureExtras(slug: string): string {
  const page = getFeaturePage(slug)
  if (!page) return ''
  return renderToStaticMarkup(
    <>
      <ArticleFooter page={page} />
      <Footer />
    </>,
  )
}
