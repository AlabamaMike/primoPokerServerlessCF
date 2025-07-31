import { Layout } from "@/components/layout/Layout"
import { Button } from "@/components/ui/button"
import { PokerCard } from "@/components/poker/Card"
import { Card as CardType, Suit, Rank } from "@primo-poker/shared"

// Sample cards for demonstration
const sampleCards: CardType[] = [
  { suit: Suit.HEARTS, rank: Rank.ACE },
  { suit: Suit.SPADES, rank: Rank.KING },
  { suit: Suit.DIAMONDS, rank: Rank.QUEEN },
  { suit: Suit.CLUBS, rank: Rank.JACK },
]

export default function Home() {
  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            Welcome to <span className="text-yellow-400">Primo Poker</span>
          </h1>
          <p className="text-xl text-white/80 mb-8">
            Professional serverless poker platform powered by Cloudflare Workers
          </p>
          
          {/* Demo Cards */}
          <div className="flex justify-center items-center gap-4 mb-8">
            {sampleCards.map((card, index) => (
              <PokerCard
                key={index}
                card={card}
                size="lg"
                className="hover:scale-110 transition-transform"
              />
            ))}
          </div>

          <div className="flex justify-center gap-4">
            <Button variant="poker" size="xl">
              🎮 Enter Lobby
            </Button>
            <Button variant="outline" size="xl" className="text-white border-white/30 hover:bg-white/10">
              🏆 Tournaments
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <div className="bg-black/20 backdrop-blur-sm rounded-lg p-6 border border-green-600/30">
            <div className="text-2xl mb-3">⚡</div>
            <h3 className="text-xl font-semibold text-white mb-2">Real-time Gameplay</h3>
            <p className="text-white/70">
              Experience lightning-fast poker action with WebSocket-powered real-time updates
            </p>
          </div>

          <div className="bg-black/20 backdrop-blur-sm rounded-lg p-6 border border-green-600/30">
            <div className="text-2xl mb-3">🔐</div>
            <h3 className="text-xl font-semibold text-white mb-2">Provably Fair</h3>
            <p className="text-white/70">
              Cryptographically verified shuffle algorithms ensure complete fairness
            </p>
          </div>

          <div className="bg-black/20 backdrop-blur-sm rounded-lg p-6 border border-green-600/30">
            <div className="text-2xl mb-3">🌍</div>
            <h3 className="text-xl font-semibold text-white mb-2">Global Scale</h3>
            <p className="text-white/70">
              Serverless architecture delivers low-latency gameplay worldwide
            </p>
          </div>
        </div>

        {/* Game Variants */}
        <div className="bg-black/20 backdrop-blur-sm rounded-lg p-8 border border-green-600/30">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Game Variants</h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl mb-2">🂡</div>
              <h3 className="text-lg font-semibold text-white">Texas Hold&apos;em</h3>
              <p className="text-white/60 text-sm">The world&apos;s most popular poker variant</p>
            </div>
            
            <div className="text-center">
              <div className="text-3xl mb-2">🂢</div>
              <h3 className="text-lg font-semibold text-white">Omaha</h3>
              <p className="text-white/60 text-sm">Four hole cards for bigger action</p>
            </div>
            
            <div className="text-center">
              <div className="text-3xl mb-2">🂣</div>
              <h3 className="text-lg font-semibold text-white">Seven Card Stud</h3>
              <p className="text-white/60 text-sm">Classic poker with exposed cards</p>
            </div>
            
            <div className="text-center">
              <div className="text-3xl mb-2">🏆</div>
              <h3 className="text-lg font-semibold text-white">Tournaments</h3>
              <p className="text-white/60 text-sm">Multi-table tournament action</p>
            </div>
            
            <div className="text-center">
              <div className="text-3xl mb-2">⚡</div>
              <h3 className="text-lg font-semibold text-white">Sit & Go</h3>
              <p className="text-white/60 text-sm">Quick tournament format</p>
            </div>
            
            <div className="text-center">
              <div className="text-3xl mb-2">🎯</div>
              <h3 className="text-lg font-semibold text-white">Heads Up</h3>
              <p className="text-white/60 text-sm">One-on-one poker battles</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
