import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Headphones, ListVideo, User, Clock, ChevronDown } from 'lucide-react';
import type { PlaylistInfo, PlaylistItem } from '@workspace/api-client-react';
import PlaylistItemCard from './PlaylistItemCard';
import DownloadButton from './DownloadButton';

interface PlaylistResultProps {
  playlist: PlaylistInfo;
}

export default function PlaylistResult({ playlist }: PlaylistResultProps) {
  const [showAll, setShowAll] = useState(false);
  const maxVisible = 10;
  
  const visibleVideos = showAll ? playlist.videos : playlist.videos.slice(0, maxVisible);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-5xl mx-auto mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8"
    >
      <div className="lg:col-span-4 flex flex-col gap-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="glassmorphism rounded-2xl p-4 border border-white/10"
        >
          <div className="relative aspect-video rounded-xl overflow-hidden mb-4 shadow-xl">
            <img
              src={playlist.thumbnail}
              alt={playlist.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
            <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-sm border border-white/10 px-2 py-1 rounded text-xs font-semibold flex items-center gap-1.5 text-white">
              <ListVideo size={14} />
              Playlist
            </div>
          </div>
          
          <h2 className="text-xl font-bold text-white mb-2 leading-tight">
            {playlist.title}
          </h2>
          
          <div className="flex flex-col gap-2 mt-4">
            {playlist.creator && (
              <div className="flex items-center gap-2 text-sm text-white/60">
                <User size={16} />
                <span>{playlist.creator}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-white/60">
              <ListVideo size={16} />
              <span>{playlist.videoCount} videos</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Clock size={16} />
              <span>{playlist.totalDuration}</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col gap-4"
        >
          {/* Note: Bulk download typically needs a backend zip creation or multiple window.opens. 
              We'll use a placeholder action or download first item as an example. */}
          <DownloadButton
            label="Download All MP4"
            icon={<Play size={20} fill="currentColor" />}
            format="video"
            url={playlist.url}
            isPrimary={true}
            qualities={['highest', '1080p', '720p', '480p']}
            defaultQuality="highest"
          />
          <DownloadButton
            label="Download All MP3"
            icon={<Headphones size={20} />}
            format="audio"
            url={playlist.url}
          />
        </motion.div>
      </div>

      <div className="lg:col-span-8">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="glassmorphism rounded-2xl p-6 border border-white/10"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ListVideo size={20} className="text-primary" />
              Playlist Items
            </h3>
            <span className="text-sm font-medium text-white/40 bg-white/5 px-3 py-1 rounded-full border border-white/10">
              {playlist.videoCount} Tracks
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {visibleVideos.map((video: PlaylistItem, idx: number) => (
              <PlaylistItemCard key={video.videoId + idx} item={video} index={idx} />
            ))}
          </div>

          {playlist.videos.length > maxVisible && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full mt-6 py-3 rounded-xl border border-white/10 text-white/70 font-semibold text-sm hover:bg-white/5 hover:text-white transition-colors flex items-center justify-center gap-2"
            >
              {showAll ? 'Show Less' : `Show All ${playlist.videoCount} Videos`}
              <ChevronDown size={16} className={`transition-transform ${showAll ? 'rotate-180' : ''}`} />
            </button>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
