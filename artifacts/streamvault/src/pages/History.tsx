import { motion } from 'framer-motion';
import { History as HistoryIcon, Download, Search, Play, Headphones, Trash2 } from 'lucide-react';
import { useState } from 'react';

// Mock data since we don't have a backend for this yet
const MOCK_HISTORY = [
  {
    id: 1,
    title: 'Designing a Modern Web App Interface from Scratch',
    thumbnail: 'https://images.unsplash.com/photo-1555099962-4199c345e5dd?auto=format&fit=crop&q=80&w=300',
    date: 'Today at 2:30 PM',
    format: 'video',
    quality: '1080p',
    channel: 'Design Course',
  },
  {
    id: 2,
    title: 'Lofi Hip Hop Radio - Beats to Relax/Study to',
    thumbnail: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&q=80&w=300',
    date: 'Yesterday at 8:15 PM',
    format: 'audio',
    quality: '320kbps',
    channel: 'Lofi Girl',
  },
  {
    id: 3,
    title: '10 React Patterns You Should Know',
    thumbnail: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&q=80&w=300',
    date: 'Oct 24, 2023',
    format: 'video',
    quality: '4K',
    channel: 'Fireship',
  }
];

export default function History() {
  const [history, setHistory] = useState(MOCK_HISTORY);

  const clearHistory = () => {
    setHistory([]);
  };

  const removeHistoryItem = (id: number) => {
    setHistory(history.filter(h => h.id !== id));
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-10"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
            <HistoryIcon size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Download History</h1>
            <p className="text-white/50 text-sm">Your recent downloads from StreamVault</p>
          </div>
        </div>
        
        {history.length > 0 && (
          <button 
            onClick={clearHistory}
            className="px-4 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-colors"
          >
            Clear All
          </button>
        )}
      </motion.div>

      {history.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full glassmorphism rounded-3xl p-12 flex flex-col items-center justify-center text-center border-dashed"
        >
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
            <Download size={32} className="text-white/20" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No history yet</h3>
          <p className="text-white/50 max-w-md">
            Your downloaded videos and audio files will appear here. Go back to the home page to start downloading.
          </p>
        </motion.div>
      ) : (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* Search bar inside history */}
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
            <input 
              type="text" 
              placeholder="Search history..." 
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="grid gap-4">
            {history.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="glassmorphism p-4 rounded-2xl flex flex-col sm:flex-row gap-4 items-center group relative overflow-hidden"
              >
                <div className="w-full sm:w-40 aspect-video rounded-lg overflow-hidden shrink-0 relative">
                  <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {item.format === 'video' ? <Play className="text-white" size={24} fill="currentColor" /> : <Headphones className="text-white" size={24} />}
                  </div>
                </div>

                <div className="flex-1 min-w-0 w-full">
                  <h3 className="font-semibold text-white truncate mb-1 pr-8">{item.title}</h3>
                  <p className="text-white/50 text-sm mb-3">{item.channel}</p>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
                      item.format === 'video' ? 'bg-primary/20 text-primary' : 'bg-white/10 text-white/70'
                    }`}>
                      {item.format === 'video' ? 'MP4' : 'MP3'}
                    </span>
                    <span className="px-2 py-1 rounded-md bg-white/5 text-white/60 text-xs font-semibold border border-white/5">
                      {item.quality}
                    </span>
                    <span className="text-white/30 text-xs ml-2">
                      {item.date}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={() => removeHistoryItem(item.id)}
                  className="absolute top-4 right-4 p-2 text-white/20 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label="Remove from history"
                >
                  <Trash2 size={18} />
                </button>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
