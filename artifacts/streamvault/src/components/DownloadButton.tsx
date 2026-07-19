import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import QualitySelector from './QualitySelector';
import { useToast } from '@/hooks/use-toast';

interface DownloadButtonProps {
  label: string;
  icon: React.ReactNode;
  format: 'video' | 'audio';
  url: string;
  isPrimary?: boolean;
  qualities?: string[];
  defaultQuality?: string;
  onDownloadStart?: () => void;
}

export default function DownloadButton({
  label,
  icon,
  format,
  url,
  isPrimary = false,
  qualities,
  defaultQuality,
  onDownloadStart,
}: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState(defaultQuality || 'highest');
  const { toast } = useToast();

  const handleDownload = () => {
    setIsDownloading(true);
    if (onDownloadStart) onDownloadStart();

    toast({
      title: 'Download Started',
      description: `Preparing your ${format} file...`,
    });

    const params = new URLSearchParams({
      url,
      format,
    });
    
    if (format === 'video' && selectedQuality) {
      params.append('quality', selectedQuality);
    }

    const downloadUrl = `/api/download?${params.toString()}`;
    
    // Create an invisible anchor to trigger download without replacing current page
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.target = '_blank';
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Reset UI state quickly assuming download starts in background
    setTimeout(() => {
      setIsDownloading(false);
    }, 2000);
  };

  return (
    <div className={`p-4 rounded-2xl border transition-all ${
      isPrimary 
        ? 'glassmorphism border-primary/30 bg-primary/5 hover:border-primary/50' 
        : 'glassmorphism border-white/10 hover:border-white/20'
    }`}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-3 ${isPrimary ? 'text-primary' : 'text-white'}`}>
            {icon}
            <span className="font-semibold">{label}</span>
          </div>
          {qualities && qualities.length > 0 && (
            <QualitySelector
              options={qualities}
              value={selectedQuality}
              onChange={setSelectedQuality}
              disabled={isDownloading}
            />
          )}
        </div>
        
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 ${
            isPrimary
              ? 'bg-primary text-white hover:bg-primary/90 shadow-[0_0_20px_rgba(229,9,20,0.3)] disabled:shadow-none'
              : 'bg-white text-black hover:bg-white/90 disabled:bg-white/50'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isDownloading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Preparing...
            </>
          ) : (
            `Download ${format.toUpperCase()}`
          )}
        </button>
      </div>
    </div>
  );
}
