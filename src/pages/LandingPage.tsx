import HeroSection from '../components/landing/HeroSection'
import StatsSection from '../components/landing/StatsSection'
import FeaturesSection from '../components/landing/FeaturesSection'

export default function LandingPage() {
  return (
    <div className="bg-background min-h-screen">
      <main>
        <HeroSection />
        <StatsSection />
        <FeaturesSection />
      </main>
      <footer className="bg-foreground border-t border-white/10 py-8 text-center">
        <p className="font-mono text-xs text-white/35 tracking-widest uppercase">
          CrowdLess © 2025 · Powered by YOLOv11
        </p>
      </footer>
    </div>
  )
}
