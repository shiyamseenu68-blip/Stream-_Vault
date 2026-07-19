import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SearchBar from '@/components/SearchBar';
import SkeletonLoader from '@/components/SkeletonLoader';
import ErrorCard from '@/components/ErrorCard';
import VideoResult from '@/components/VideoResult';
import PlaylistResult from '@/components/PlaylistResult';
import { useAnalyzeUrl } from '@workspace/api-client-react';

export default function Home() {
  const [detectedType, setDetectedType] = useState<'video' | 'playlist' | 'short' | null>(null);
  
  const analyzeMutation = useAnalyzeUrl({
    mutation: {
      onSuccess: (data) => {
        setDetectedType(data.type as any); // The API schemas use specific types
      },
      onError: () => {
        setDetectedType(null);
      }
    }
  });

  const handleAnalyze = (url: string) => {
    setDetectedType(null); // reset
    analyzeMutation.mutate({ data: { url } });
  };

  const handleClearUrl = () => {
    analyzeMutation.reset();
    setDetectedType(null);
  };

  return (
    <div className="w-full flex-1 flex flex-col relative overflow-hidden">
      {/* Background elements */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] mix-blend-screen animate-pulse duration-10000"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px] mix-blend-screen animate-pulse duration-7000"></div>
      </div>

      <div className="container mx-auto px-4 py-20 flex-1 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-3xl mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glassmorphism border border-white/10 text-xs font-semibold text-white/70 mb-6 uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            Version 1.0.0
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6">
            Download <span className="relative whitespace-nowrap">
              <span className="relative z-10 text-white">YouTube</span>
              <span className="absolute bottom-1 left-0 w-full h-3 bg-primary/60 -z-10 -rotate-1 skew-x-12"></span>
            </span> Videos
          </h1>
          
          <p className="text-lg md:text-xl text-white/50 mb-8 font-light">
            Fast. Secure. High Quality.<br/>
            Download YouTube videos, shorts and playlists in multiple qualities with a beautiful modern interface.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {['No Registration', 'HD Quality', 'Fast Downloads', 'Playlist Support'].map((pill, i) => (
              <span key={i} className="px-4 py-2 rounded-xl text-sm font-medium glassmorphism border border-white/5 text-white/60">
                {pill}
              </span>
            ))}
          </div>
        </motion.div>

        <div className="w-full">
          <SearchBar 
            onAnalyze={handleAnalyze} 
            isLoading={analyzeMutation.isPending} 
            detectedType={detectedType} 
          />
        </div>

        <div className="w-full">
          <AnimatePresence mode="wait">
            {analyzeMutation.isPending && (
              <SkeletonLoader key="skeleton" />
            )}

            {analyzeMutation.isError && (
              <ErrorCard 
                key="error" 
                title="Analysis Failed" 
                message={analyzeMutation.error?.message || "We couldn't analyze that URL. Please make sure it's a valid YouTube link and try again."} 
              />
            )}

            {analyzeMutation.isSuccess && analyzeMutation.data && (
              <motion.div key="result" className="w-full pb-20">
                {analyzeMutation.data.type === 'video' ? (
                  <VideoResult video={analyzeMutation.data} />
                ) : (
                  <PlaylistResult playlist={analyzeMutation.data} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
