import { motion } from 'framer-motion';
import { Play, Headphones, Clock } from 'lucide-react';
import type { PlaylistItem } from '@workspace/api-client-react';
import { useState } from 'react';
import QualitySelector from './QualitySelector';

interface PlaylistItemCardProps {
  item: PlaylistItem;
  index: number;
}

export default function PlaylistItemCard({ item, index }: PlaylistItemCardProps) {
  const [selectedQuality, setSelectedQuality] = useState('highest');
  const videoQualities = ['highest', '1080p', '720p', '480p', '360p'];

  const handleDownload = (format: 'video' | 'audio') => {
    const params = new URLSearchParams({
      url: item.url,
      format,
    });
    
    if (format === 'video' && selectedQuality) {
      params.append('quality', selectedQuality);
    }

    // Use GET /api/download directly — POST /api/download/playlist only redirects here anyway
    const downloadUrl = `/api/download?${params.toString()}`;
    
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.target = '_blank';
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="glassmorphism p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors flex flex-col sm:flex-row gap-4 items-start sm:items-center group"
    >
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <span className="text-white/30 font-mono text-sm w-6 text-center">{index + 1}</span>
        <div className="relative w-32 aspect-video rounded-lg overflow-hidden shrink-0">
          <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px] font-medium backdrop-blur-sm">
            {item.duration}
          </div>
        </div>
      </div>
      
      <div className="flex-1 min-w-0 pr-4">
        <h4 className="font-semibold text-white/90 text-sm line-clamp-1 mb-1 group-hover:text-white transition-colors">{item.title}</h4>
        {item.channel && (
          <p className="text-white/40 text-xs truncate">{item.channel}</p>
        )}
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 justify-end">
        <QualitySelector
          options={videoQualities}
          value={selectedQuality}
          onChange={setSelectedQuality}
        />
        <button
          onClick={() => handleDownload('video')}
          className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors border border-primary/20"
          title="Download MP4"
          aria-label="Download Video"
        >
          <Play size={16} fill="currentColor" />
        </button>
        <button
          onClick={() => handleDownload('audio')}
          className="p-2 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors border border-white/5"
          title="Download MP3"
          aria-label="Download Audio"
        >
          <Headphones size={16} />
        </button>
      </div>
    </motion.div>
  );
}
