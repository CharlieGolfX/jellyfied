import { BookOpen, Clapperboard, Film, Folder, Image as ImageIcon, ListMusic, MonitorPlay, Music, Radio, Tv, Video } from 'lucide-react';
import type { CollectionType, VirtualFolderInfo } from '@/api/types';

export function LibraryIcon({
  type,
  size = 20,
}: {
  /** What a library view is of, or what a library was set up as (which also has 'mixed'). */
  type?: CollectionType | VirtualFolderInfo['CollectionType'];
  size?: number;
}) {
  const p = { size, strokeWidth: 1.75 };
  switch (type) {
    case 'movies':
      return <Film {...p} />;
    case 'tvshows':
      return <Tv {...p} />;
    case 'music':
      return <Music {...p} />;
    case 'musicvideos':
      return <MonitorPlay {...p} />;
    case 'homevideos':
      return <Video {...p} />;
    case 'photos':
      return <ImageIcon {...p} />;
    case 'books':
      return <BookOpen {...p} />;
    case 'boxsets':
      return <Clapperboard {...p} />;
    case 'playlists':
      return <ListMusic {...p} />;
    case 'livetv':
      return <Radio {...p} />;
    default:
      return <Folder {...p} />;
  }
}
