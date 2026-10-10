// Hand-written subset of the Jellyfin 10.10/10.11 API models used by Jellyplex.

export type ItemType =
  | 'AggregateFolder'
  | 'Audio'
  | 'AudioBook'
  | 'BasePluginFolder'
  | 'Book'
  | 'BoxSet'
  | 'Channel'
  | 'ChannelFolderItem'
  | 'CollectionFolder'
  | 'Episode'
  | 'Folder'
  | 'Genre'
  | 'ManualPlaylistsFolder'
  | 'Movie'
  | 'LiveTvChannel'
  | 'LiveTvProgram'
  | 'MusicAlbum'
  | 'MusicArtist'
  | 'MusicGenre'
  | 'MusicVideo'
  | 'Person'
  | 'Photo'
  | 'PhotoAlbum'
  | 'Playlist'
  | 'PlaylistsFolder'
  | 'Program'
  | 'Recording'
  | 'Season'
  | 'Series'
  | 'Studio'
  | 'Trailer'
  | 'TvChannel'
  | 'TvProgram'
  | 'UserRootFolder'
  | 'UserView'
  | 'Video'
  | 'Year';

export type CollectionType =
  | 'movies'
  | 'tvshows'
  | 'music'
  | 'musicvideos'
  | 'trailers'
  | 'homevideos'
  | 'boxsets'
  | 'books'
  | 'photos'
  | 'livetv'
  | 'playlists'
  | 'folders'
  | 'unknown';

export type ImageType =
  | 'Primary'
  | 'Art'
  | 'Backdrop'
  | 'Banner'
  | 'Logo'
  | 'Thumb'
  | 'Disc'
  | 'Box'
  | 'Screenshot'
  | 'Menu'
  | 'Chapter'
  | 'BoxRear'
  | 'Profile';

export interface UserItemData {
  PlaybackPositionTicks?: number;
  PlayCount?: number;
  IsFavorite?: boolean;
  Played?: boolean;
  PlayedPercentage?: number | null;
  UnplayedItemCount?: number | null;
  LastPlayedDate?: string | null;
  Key?: string;
  ItemId?: string;
}

export interface MediaStream {
  Codec?: string | null;
  Language?: string | null;
  DisplayTitle?: string | null;
  Title?: string | null;
  Type: 'Audio' | 'Video' | 'Subtitle' | 'EmbeddedImage' | 'Data' | 'Lyric';
  Index: number;
  IsDefault?: boolean;
  IsForced?: boolean;
  IsExternal?: boolean;
  IsTextSubtitleStream?: boolean;
  SupportsExternalStream?: boolean;
  DeliveryMethod?: 'Encode' | 'Embed' | 'External' | 'Hls' | 'Drop' | null;
  DeliveryUrl?: string | null;
  Channels?: number | null;
  ChannelLayout?: string | null;
  BitRate?: number | null;
  Width?: number | null;
  Height?: number | null;
  AverageFrameRate?: number | null;
  RealFrameRate?: number | null;
  Profile?: string | null;
  VideoRange?: string | null;
  VideoRangeType?: string | null;
  SampleRate?: number | null;
  BitDepth?: number | null;
}

export interface MediaSourceInfo {
  Id: string;
  Name?: string | null;
  Path?: string | null;
  Protocol?: string;
  Container?: string | null;
  Size?: number | null;
  Bitrate?: number | null;
  RunTimeTicks?: number | null;
  ETag?: string | null;
  SupportsDirectPlay?: boolean;
  SupportsDirectStream?: boolean;
  SupportsTranscoding?: boolean;
  TranscodingUrl?: string | null;
  TranscodingSubProtocol?: string | null;
  TranscodingContainer?: string | null;
  MediaStreams?: MediaStream[];
  DefaultAudioStreamIndex?: number | null;
  DefaultSubtitleStreamIndex?: number | null;
  LiveStreamId?: string | null;
}

export interface NameIdPair {
  Name: string;
  Id: string;
}

export interface BaseItemPerson {
  Name: string;
  Id: string;
  Role?: string | null;
  Type?: string;
  PrimaryImageTag?: string | null;
}

export interface ChapterInfo {
  StartPositionTicks: number;
  Name?: string | null;
  ImageTag?: string | null;
}

export interface BaseItemDto {
  Id: string;
  Name?: string | null;
  OriginalTitle?: string | null;
  ServerId?: string | null;
  Type: ItemType;
  MediaType?: 'Unknown' | 'Video' | 'Audio' | 'Photo' | 'Book';
  CollectionType?: CollectionType | null;
  IsFolder?: boolean;
  ParentId?: string | null;
  Overview?: string | null;
  Taglines?: string[];
  Genres?: string[];
  GenreItems?: NameIdPair[];
  Studios?: NameIdPair[];
  People?: BaseItemPerson[];
  Tags?: string[];
  ProductionYear?: number | null;
  PremiereDate?: string | null;
  EndDate?: string | null;
  DateCreated?: string | null;
  Status?: string | null;
  OfficialRating?: string | null;
  CommunityRating?: number | null;
  CriticRating?: number | null;
  RunTimeTicks?: number | null;
  ChildCount?: number | null;
  RecursiveItemCount?: number | null;
  SeriesId?: string | null;
  SeriesName?: string | null;
  SeasonId?: string | null;
  SeasonName?: string | null;
  IndexNumber?: number | null;
  IndexNumberEnd?: number | null;
  ParentIndexNumber?: number | null;
  Album?: string | null;
  AlbumId?: string | null;
  AlbumArtist?: string | null;
  AlbumArtists?: NameIdPair[];
  ArtistItems?: NameIdPair[];
  Artists?: string[];
  AlbumPrimaryImageTag?: string | null;
  ImageTags?: Partial<Record<ImageType, string>>;
  BackdropImageTags?: string[];
  ParentBackdropItemId?: string | null;
  ParentBackdropImageTags?: string[];
  ParentThumbItemId?: string | null;
  ParentThumbImageTag?: string | null;
  ParentPrimaryImageItemId?: string | null;
  ParentPrimaryImageTag?: string | null;
  ParentLogoItemId?: string | null;
  ParentLogoImageTag?: string | null;
  SeriesPrimaryImageTag?: string | null;
  SeriesThumbImageTag?: string | null;
  PrimaryImageAspectRatio?: number | null;
  ImageBlurHashes?: Partial<Record<ImageType, Record<string, string>>>;
  UserData?: UserItemData;
  MediaSources?: MediaSourceInfo[];
  MediaStreams?: MediaStream[];
  Chapters?: ChapterInfo[];
  /** Seek-bar thumbnail sheets, keyed by media source id, then by thumbnail width. */
  Trickplay?: Record<string, Record<string, TrickplayInfo>>;
  LocalTrailerCount?: number;
  RemoteTrailers?: { Url?: string | null; Name?: string | null }[];
  ProviderIds?: Record<string, string>;
  ExternalUrls?: { Name?: string | null; Url?: string | null }[];
  Path?: string | null;
  CanDelete?: boolean;
  /** Id of this entry in its playlist (only on items listed from a playlist). */
  PlaylistItemId?: string | null;
  CanDownload?: boolean;
  LocationType?: string;
  Width?: number | null;
  Height?: number | null;
  SpecialFeatureCount?: number | null;
  PlayAccess?: string;
  Container?: string | null;
}

export interface TrickplayInfo {
  Width: number;
  Height: number;
  TileWidth: number;
  TileHeight: number;
  ThumbnailCount: number;
  /** Milliseconds between thumbnails. */
  Interval: number;
  Bandwidth?: number;
}

export interface ItemsResult<T = BaseItemDto> {
  Items: T[];
  TotalRecordCount: number;
  StartIndex?: number;
}

export interface UserPolicy {
  IsAdministrator: boolean;
  IsHidden: boolean;
  IsDisabled: boolean;
  EnableUserPreferenceAccess: boolean;
  EnableRemoteControlOfOtherUsers: boolean;
  EnableSharedDeviceControl: boolean;
  EnableRemoteAccess: boolean;
  EnableLiveTvManagement: boolean;
  EnableLiveTvAccess: boolean;
  EnableMediaPlayback: boolean;
  EnableAudioPlaybackTranscoding: boolean;
  EnableVideoPlaybackTranscoding: boolean;
  EnablePlaybackRemuxing: boolean;
  ForceRemoteSourceTranscoding: boolean;
  EnableContentDeletion: boolean;
  EnableContentDeletionFromFolders: string[];
  EnableContentDownloading: boolean;
  EnableSyncTranscoding: boolean;
  EnableMediaConversion: boolean;
  EnableAllDevices: boolean;
  EnabledDevices: string[];
  EnableAllChannels: boolean;
  EnabledChannels: string[];
  EnableAllFolders: boolean;
  EnabledFolders: string[];
  EnableCollectionManagement?: boolean;
  EnableSubtitleManagement?: boolean;
  EnableLyricManagement?: boolean;
  InvalidLoginAttemptCount: number;
  LoginAttemptsBeforeLockout: number;
  MaxActiveSessions: number;
  EnablePublicSharing: boolean;
  RemoteClientBitrateLimit: number;
  AuthenticationProviderId: string;
  PasswordResetProviderId: string;
  SyncPlayAccess?: 'CreateAndJoinGroups' | 'JoinGroups' | 'None';
  MaxParentalRating?: number | null;
  BlockedTags?: string[];
  AllowedTags?: string[];
  [key: string]: unknown;
}

export interface UserConfiguration {
  AudioLanguagePreference?: string | null;
  PlayDefaultAudioTrack: boolean;
  SubtitleLanguagePreference?: string | null;
  DisplayMissingEpisodes: boolean;
  SubtitleMode: 'Default' | 'Always' | 'OnlyForced' | 'None' | 'Smart';
  EnableNextEpisodeAutoPlay: boolean;
  RememberAudioSelections: boolean;
  RememberSubtitleSelections: boolean;
  HidePlayedInLatest: boolean;
  [key: string]: unknown;
}

export interface UserDto {
  Id: string;
  Name: string;
  ServerId?: string;
  HasPassword: boolean;
  HasConfiguredPassword: boolean;
  PrimaryImageTag?: string | null;
  LastLoginDate?: string | null;
  LastActivityDate?: string | null;
  Policy: UserPolicy;
  Configuration: UserConfiguration;
}

export interface AuthenticationResult {
  User: UserDto;
  AccessToken: string;
  ServerId: string;
}

export interface PublicSystemInfo {
  LocalAddress?: string;
  ServerName?: string;
  Version?: string;
  ProductName?: string;
  Id?: string;
  StartupWizardCompleted?: boolean;
}

export interface SystemInfo extends PublicSystemInfo {
  OperatingSystemDisplayName?: string;
  OperatingSystem?: string;
  HasPendingRestart?: boolean;
  IsShuttingDown?: boolean;
  SupportsLibraryMonitor?: boolean;
  WebSocketPortNumber?: number;
  CanSelfRestart?: boolean;
  CanLaunchWebBrowser?: boolean;
  ProgramDataPath?: string;
  WebPath?: string;
  ItemsByNamePath?: string;
  CachePath?: string;
  LogPath?: string;
  InternalMetadataPath?: string;
  TranscodingTempPath?: string;
  HasUpdateAvailable?: boolean;
  EncoderLocation?: string;
  SystemArchitecture?: string;
  PackageName?: string;
}

export interface FolderStorage {
  Path: string;
  FreeSpace: number;
  UsedSpace: number;
  StorageType?: string;
  DeviceId?: string;
}

export interface SystemStorage {
  ProgramDataFolder?: FolderStorage;
  WebFolder?: FolderStorage;
  ImageCacheFolder?: FolderStorage;
  CacheFolder?: FolderStorage;
  LogFolder?: FolderStorage;
  InternalMetadataFolder?: FolderStorage;
  TranscodingTempFolder?: FolderStorage;
  Libraries?: { Id: string; Name: string; Folders: FolderStorage[] }[];
}

export interface TranscodingInfo {
  AudioCodec?: string | null;
  VideoCodec?: string | null;
  Container?: string | null;
  IsVideoDirect?: boolean;
  IsAudioDirect?: boolean;
  Bitrate?: number | null;
  Framerate?: number | null;
  CompletionPercentage?: number | null;
  Width?: number | null;
  Height?: number | null;
  AudioChannels?: number | null;
  HardwareAccelerationType?: string | null;
  TranscodeReasons?: string[];
}

export interface PlayerStateInfo {
  PositionTicks?: number | null;
  CanSeek?: boolean;
  IsPaused?: boolean;
  IsMuted?: boolean;
  VolumeLevel?: number | null;
  AudioStreamIndex?: number | null;
  SubtitleStreamIndex?: number | null;
  MediaSourceId?: string | null;
  PlayMethod?: 'Transcode' | 'DirectStream' | 'DirectPlay' | null;
}

export interface SessionInfo {
  Id: string;
  UserId?: string;
  UserName?: string | null;
  Client?: string | null;
  DeviceName?: string | null;
  DeviceId?: string | null;
  ApplicationVersion?: string | null;
  RemoteEndPoint?: string | null;
  LastActivityDate?: string;
  LastPlaybackCheckIn?: string;
  IsActive?: boolean;
  SupportsRemoteControl?: boolean;
  NowPlayingItem?: BaseItemDto | null;
  PlayState?: PlayerStateInfo;
  TranscodingInfo?: TranscodingInfo | null;
}

export interface VirtualFolderInfo {
  Name: string;
  Locations: string[];
  CollectionType?: CollectionType | null;
  LibraryOptions?: Record<string, unknown> & {
    PathInfos?: { Path: string; NetworkPath?: string | null }[];
  };
  ItemId: string;
  PrimaryImageItemId?: string | null;
  RefreshProgress?: number | null;
  RefreshStatus?: string | null;
}

export interface TaskResult {
  StartTimeUtc?: string;
  EndTimeUtc?: string;
  Status?: 'Completed' | 'Failed' | 'Cancelled' | 'Aborted';
  Name?: string;
  Key?: string;
  Id?: string;
  ErrorMessage?: string | null;
  LongErrorMessage?: string | null;
}

export interface TaskInfo {
  Name: string;
  State: 'Idle' | 'Cancelling' | 'Running';
  CurrentProgressPercentage?: number | null;
  Id: string;
  LastExecutionResult?: TaskResult | null;
  Triggers?: { Type: string; IntervalTicks?: number; TimeOfDayTicks?: number; DayOfWeek?: string }[];
  Description?: string;
  Category?: string;
  IsHidden?: boolean;
  Key?: string;
}

export interface ActivityLogEntry {
  Id: number;
  Name: string;
  Overview?: string | null;
  ShortOverview?: string | null;
  Type: string;
  ItemId?: string | null;
  Date: string;
  UserId: string;
  UserPrimaryImageTag?: string | null;
  Severity: 'Trace' | 'Debug' | 'Information' | 'Warning' | 'Error' | 'Critical' | 'None';
}

export interface DeviceInfo {
  Name?: string | null;
  CustomName?: string | null;
  AccessToken?: string | null;
  Id: string;
  LastUserName?: string | null;
  AppName?: string | null;
  AppVersion?: string | null;
  LastUserId?: string;
  DateLastActivated?: string;
}

export interface PluginInfo {
  Name: string;
  Version: string;
  ConfigurationFileName?: string | null;
  Description: string;
  Id: string;
  CanUninstall: boolean;
  HasImage: boolean;
  Status: 'Active' | 'Restart' | 'Deleted' | 'Superceded' | 'Malfunctioned' | 'NotSupported' | 'Disabled';
}

export interface ConfigurationPageInfo {
  Name: string;
  DisplayName?: string | null;
  PluginId?: string | null;
  EnableInMainMenu?: boolean;
}

export interface VersionInfo {
  version: string;
  VersionNumber?: string;
  changelog?: string | null;
  targetAbi?: string | null;
  sourceUrl?: string | null;
  checksum?: string | null;
  timestamp?: string | null;
  repositoryName?: string;
  repositoryUrl?: string;
}

export interface PackageInfo {
  name: string;
  description: string;
  overview: string;
  owner: string;
  category: string;
  guid: string;
  versions: VersionInfo[];
  imageUrl?: string | null;
}

export interface LogFile {
  DateCreated: string;
  DateModified: string;
  Size: number;
  Name: string;
}

export interface AuthenticationInfo {
  Id: number;
  AccessToken: string;
  DeviceId?: string | null;
  AppName?: string | null;
  AppVersion?: string | null;
  DeviceName?: string | null;
  UserId?: string;
  IsActive?: boolean;
  DateCreated: string;
  DateRevoked?: string | null;
  DateLastActivity?: string;
  UserName?: string | null;
}

export interface FileSystemEntryInfo {
  Name: string;
  Path: string;
  Type: 'File' | 'Directory' | 'NetworkComputer' | 'NetworkShare';
}

export interface CultureDto {
  Name: string;
  DisplayName: string;
  TwoLetterISOLanguageName: string;
  ThreeLetterISOLanguageName?: string | null;
  ThreeLetterISOLanguageNames?: string[];
}

export interface CountryInfo {
  Name?: string | null;
  DisplayName?: string | null;
  TwoLetterISORegionName?: string | null;
  ThreeLetterISORegionName?: string | null;
}

export interface ItemCounts {
  MovieCount: number;
  SeriesCount: number;
  EpisodeCount: number;
  ArtistCount: number;
  ProgramCount: number;
  TrailerCount: number;
  SongCount: number;
  AlbumCount: number;
  MusicVideoCount: number;
  BoxSetCount: number;
  BookCount: number;
  ItemCount: number;
}

export interface QuickConnectResult {
  Authenticated: boolean;
  Secret: string;
  Code: string;
  DeviceId?: string;
  DeviceName?: string;
  AppName?: string;
  AppVersion?: string;
  DateAdded?: string;
}

export interface PlaybackInfoResponse {
  MediaSources: MediaSourceInfo[];
  PlaySessionId?: string | null;
  ErrorCode?: 'NotAllowed' | 'NoCompatibleStream' | 'RateLimitExceeded' | null;
}

export interface MediaSegment {
  Id: string;
  ItemId: string;
  Type: 'Unknown' | 'Commercial' | 'Preview' | 'Recap' | 'Outro' | 'Intro';
  StartTicks: number;
  EndTicks: number;
}

export interface QueryFilters {
  Genres?: NameIdPair[];
  Tags?: string[];
}

export type EncodingOptions = Record<string, unknown> & {
  EncodingThreadCount: number;
  HardwareAccelerationType: string;
  EnableHardwareEncoding: boolean;
  HardwareDecodingCodecs: string[];
  EnableThrottling: boolean;
  ThrottleDelaySeconds: number;
  EnableSegmentDeletion: boolean;
  SegmentKeepSeconds: number;
  EnableTonemapping: boolean;
  H264Crf: number;
  H265Crf: number;
  AllowHevcEncoding: boolean;
  AllowAv1Encoding: boolean;
  VaapiDevice: string;
  QsvDevice?: string;
  DownMixAudioBoost: number;
  EncoderPreset?: string | null;
  TranscodingTempPath?: string | null;
  EnableDecodingColorDepth10Hevc: boolean;
  EnableDecodingColorDepth10Vp9: boolean;
  EnableSubtitleExtraction: boolean;
};

export type NetworkConfiguration = Record<string, unknown> & {
  BaseUrl: string;
  EnableHttps: boolean;
  RequireHttps: boolean;
  InternalHttpPort: number;
  InternalHttpsPort: number;
  PublicHttpPort: number;
  PublicHttpsPort: number;
  AutoDiscovery: boolean;
  EnableUPnP: boolean;
  EnableIPv4: boolean;
  EnableIPv6: boolean;
  EnableRemoteAccess: boolean;
  LocalNetworkSubnets: string[];
  LocalNetworkAddresses: string[];
  KnownProxies: string[];
  RemoteIPFilter: string[];
  IsRemoteIPFilterBlacklist: boolean;
};

export type ServerConfiguration = Record<string, unknown> & {
  ServerName: string;
  PreferredMetadataLanguage: string;
  MetadataCountryCode: string;
  UICulture: string;
  QuickConnectAvailable: boolean;
  MetadataPath: string;
  CachePath?: string | null;
  MinResumePct: number;
  MaxResumePct: number;
  MinResumeDurationSeconds: number;
  MinAudiobookResume: number;
  MaxAudiobookResume: number;
  LibraryMonitorDelay: number;
  RemoteClientBitrateLimit: number;
  EnableFolderView: boolean;
  EnableGroupingMoviesIntoCollections: boolean;
  EnableGroupingShowsIntoCollections: boolean;
  DisplaySpecialsWithinSeasons: boolean;
  EnableExternalContentInSuggestions: boolean;
  ActivityLogRetentionDays?: number | null;
  LibraryScanFanoutConcurrency?: number;
  ParallelImageEncodingLimit?: number;
};
