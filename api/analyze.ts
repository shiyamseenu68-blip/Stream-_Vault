export default async function handler(req: any, res: any) {
  console.log('API analyze called:', req.method, req.url);
  
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { url } = req.body;
    console.log('Request body url:', url);

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'URL is required' });
    }

    // Check if it's a playlist URL
    const playlistMatch = url.match(/[?&]list=([^&]+)/);
    if (playlistMatch) {
      const playlistId = playlistMatch[1];
      console.log('Detected playlist:', playlistId);
      const result = await analyzePlaylist(playlistId, url);
      console.log('Playlist analysis result:', result.type, result.videoCount);
      return res.status(200).json(result);
    }

    // Check if it's a video URL
    const videoMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (videoMatch) {
      const videoId = videoMatch[1];
      console.log('Detected video:', videoId);
      const result = await analyzeVideo(videoId, url);
      console.log('Video analysis result:', result.type, result.title);
      return res.status(200).json(result);
    }

    console.log('Invalid URL detected');
    return res.status(400).json({ 
      error: 'INVALID_URL', 
      message: 'Please provide a valid YouTube URL' 
    });
  } catch (error) {
    console.error('Error analyzing URL:', error);
    return res.status(500).json({ 
      error: 'ANALYSIS_FAILED', 
      message: error instanceof Error ? error.message : 'Failed to analyze URL. Please try again.' 
    });
  }
}

async function analyzePlaylist(playlistId: string, originalUrl: string) {
  try {
    console.log('Fetching RSS feed for playlist:', playlistId);
    // Use YouTube RSS feed for playlist analysis
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
    const response = await fetch(rssUrl);
    
    if (!response.ok) {
      throw new Error(`Playlist not found or private (RSS status ${response.status})`);
    }

    const xmlText = await response.text();
    console.log('RSS feed received, length:', xmlText.length);
    
    // Parse XML to extract playlist info
    const titleMatch = xmlText.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1] : 'Unknown Playlist';
    
    const videoMatches = xmlText.matchAll(/<yt:videoId>([^<]+)<\/yt:videoId>/g);
    const videoIds = Array.from(videoMatches).map(m => m[1]);
    
    console.log('Found videos in playlist:', videoIds.length);
    
    if (videoIds.length === 0) {
      throw new Error('No videos found in playlist');
    }

    const videos = videoIds.slice(0, 50).map(videoId => ({
      videoId,
      title: `Video ${videoId}`,
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      duration: '0:00',
      durationSeconds: 0,
      channel: 'Unknown',
      views: '0',
      url: `https://www.youtube.com/watch?v=${videoId}`
    }));

    return {
      type: 'playlist',
      playlistId,
      title,
      thumbnail: videos[0]?.thumbnail || '',
      videoCount: videos.length,
      totalDuration: 'N/A',
      totalDurationSeconds: 0,
      creator: 'YouTube',
      url: originalUrl,
      videos
    };
  } catch (error) {
    console.error('Playlist analysis error:', error);
    throw new Error(`Failed to analyze playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function analyzeVideo(videoId: string, originalUrl: string) {
  try {
    // Use YouTube oEmbed endpoint for basic video info
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oembedUrl);
    
    if (!response.ok) {
      throw new Error('Video not found or private');
    }

    const data = await response.json();
    
    return {
      type: 'video',
      videoId,
      title: data.title || 'Unknown Video',
      thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      duration: '0:00',
      durationSeconds: 0,
      channel: data.author_name || 'Unknown',
      channelUrl: data.author_url || '',
      channelAvatar: null,
      subscribers: 'Unknown',
      viewCount: 0,
      uploadDate: 'Unknown',
      description: '',
      category: 'Unknown',
      isShort: false,
      url: originalUrl
    };
  } catch (error) {
    throw new Error(`Failed to analyze video: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
