import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Headphones, ListVideo, User, Clock, ChevronDown, Loader2, Download } from 'lucide-react';
import type { PlaylistInfo, PlaylistItem } from '@workspace/api-client-react';
import PlaylistItemCard from './PlaylistItemCard';
import { useToast } from '@/hooks/use-toast';

interface PlaylistResultProps {
  playlist: PlaylistInfo;
}

/**
 * Triggers individual browser downloads for every video in the playlist
 * with a small stagger so the browser doesn't block them all at once.
 */
function useBulkDownload(videos: PlaylistItem[]) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const startDownload = (format: 'video' | 'audio', quality: string) => {
    if (isDownloading || videos.length === 0) return;
    setIsDownloading(true);
    setProgress(0);

    toast({
      title: 'Bulk Download Started',
      description: `Queuing ${videos.length} ${format === 'video' ? 'MP4' : 'MP3'} downloads…`,
    });

    // Open one download per video with a 600 ms stagger.
    // Using /api/download (GET) with the individual video URL.
    videos.forEach((video, idx) => {
      setTimeout(() => {
        const params = new URLSearchParams({
          url: video.url,
          format,
          ...(format === 'video' ? { quality } : {}),
        });
        const a = document.createElement('a');
        a.href = `/api/download?${params.toString()}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setProgress(idx + 1);
        if (idx === videos.length - 1) {
          setTimeout(() => {
            setIsDownloading(false);
            setProgress(0);
          }, 1500);
        }
      }, idx * 600);
    });
  };

  return { isDownloading, progress, startDownload };
}

export default function PlaylistResult({ playlist }: PlaylistResultProps) {
  const [showAll, setShowAll] = useState(false);
  const [videoQuality, setVideoQuality] = useState('highest');
  const maxVisible = 10;

  const visibleVideos = showAll ? playlist.videos : playlist.videos.slice(0, maxVisible);
  const { isDownloading, progress, startDownload } = useBulkDownload(playlist.videos);

  const qualities = ['highest', '1080p', '720p', '480p', '360p'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-5xl mx-auto mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8"
    >
      {/* ── Left column: playlist metadata + bulk download ── */}
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
              loading="lazy"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
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

        {/* ── Bulk download controls ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glassmorphism rounded-2xl p-4 border border-white/10 flex flex-col gap-4"
        >
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider flex items-center gap-2">
            <Download size={14} />
            Bulk Download
          </h3>

          {/* Quality selector for video bulk download */}
          <div className="flex items-center justify-between text-sm text-white/60">
            <span>Video quality</span>
            <select
              value={videoQuality}
              onChange={(e) => setVideoQuality(e.target.value)}
              disabled={isDownloading}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-primary disabled:opacity-50"
            >
              {qualities.map((q) => (
                <option key={q} value={q} className="bg-[#090909]">{q}</option>
              ))}
            </select>
          </div>

          {/* Progress bar while downloading */}
          {isDownloading && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-white/40">
                <span>Queuing downloads…</span>
                <span>{progress} / {playlist.videos.length}</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(progress / playlist.videos.length) * 100}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                />
              </div>
            </div>
          )}

          <button
            onClick={() => startDownload('video', videoQuality)}
            disabled={isDownloading || playlist.videos.length === 0}
            data-testid="button-download-all-video"
            className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(229,9,20,0.2)]"
          >
            {isDownloading ? (
              <><Loader2 size={18} className="animate-spin" /> Downloading…</>
            ) : (
              <><Play size={18} fill="currentColor" /> Download All MP4</>
            )}
          </button>

          <button
            onClick={() => startDownload('audio', 'highest')}
            disabled={isDownloading || playlist.videos.length === 0}
            data-testid="button-download-all-audio"
            className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 bg-white text-black hover:bg-white/90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloading ? (
              <><Loader2 size={18} className="animate-spin" /> Downloading…</>
            ) : (
              <><Headphones size={18} /> Download All MP3</>
            )}
          </button>

          {playlist.videos.length === 0 && (
            <p className="text-xs text-white/30 text-center">No downloadable videos found in this playlist</p>
          )}
        </motion.div>
      </div>

      {/* ── Right column: video list ── */}
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
