import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Headphones, ChevronDown, CheckCircle2, User, Clock, Eye, Calendar, Tag } from 'lucide-react';
import type { VideoInfo } from '@workspace/api-client-react';
import DownloadButton from './DownloadButton';

interface VideoResultProps {
  video: VideoInfo;
}

export default function VideoResult({ video }: VideoResultProps) {
  const [showMore, setShowMore] = useState(false);

  const formatViews = (views: number | null) => {
    if (!views) return null;
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
    return views.toString();
  };

  const videoQualities = ['highest', '1080p', '720p', '480p', '360p'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-4xl mx-auto mt-12 grid grid-cols-1 md:grid-cols-12 gap-8"
    >
      <div className="md:col-span-5">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl border border-white/10 group"
        >
          <img
            src={video.thumbnail}
            alt={video.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
          <div className="absolute bottom-3 right-3 px-2 py-1 rounded bg-black/80 text-white text-xs font-medium backdrop-blur-sm border border-white/10">
            {video.duration}
          </div>
        </motion.div>
      </div>

      <div className="md:col-span-7 flex flex-col">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-2xl md:text-3xl font-bold leading-tight text-white mb-4 line-clamp-2">
            {video.title}
          </h2>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/10 bg-white/5 flex items-center justify-center">
              {video.channelAvatar ? (
                <img src={video.channelAvatar} alt={video.channel} className="w-full h-full object-cover" />
              ) : (
                <User size={24} className="text-white/40" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-white">{video.channel}</span>
                <CheckCircle2 size={14} className="text-white/50" />
              </div>
              <div className="text-sm text-white/50">
                {video.subscribers ? `${video.subscribers} subscribers` : 'YouTube Channel'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-white/60 mb-6">
            {video.viewCount && (
              <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                <Eye size={14} />
                <span>{formatViews(video.viewCount)} views</span>
              </div>
            )}
            {video.uploadDate && (
              <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                <Calendar size={14} />
                <span>{video.uploadDate}</span>
              </div>
            )}
            {video.category && (
              <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                <Tag size={14} />
                <span>{video.category}</span>
              </div>
            )}
          </div>
        </motion.div>

        {video.description && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mb-8 relative"
          >
            <div className={`text-sm text-white/50 leading-relaxed ${showMore ? '' : 'line-clamp-2'}`}>
              {video.description}
            </div>
            <button
              onClick={() => setShowMore(!showMore)}
              className="mt-2 text-xs font-semibold text-primary hover:text-white transition-colors flex items-center gap-1"
            >
              {showMore ? 'Show less' : 'Show more'}
              <ChevronDown size={12} className={`transition-transform ${showMore ? 'rotate-180' : ''}`} />
            </button>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-auto"
        >
          <DownloadButton
            label="Download Video"
            icon={<Play size={20} fill="currentColor" />}
            format="video"
            url={video.url}
            isPrimary={true}
            qualities={videoQualities}
            defaultQuality="highest"
          />
          <DownloadButton
            label="Download Audio"
            icon={<Headphones size={20} />}
            format="audio"
            url={video.url}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
