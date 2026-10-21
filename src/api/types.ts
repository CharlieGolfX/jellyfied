// The Jellyfin API models Jellyfied uses, cut out of the ones generated from the server's OpenAPI
// document (generated.ts, `npm run generate:api`). A type lists the fields the app reads or writes:
// first those taken exactly as the server describes them, then those the app relies on being
// there (the server marks nearly everything optional), then those described more exactly here.
// A field the server does not have, or a type the server's description rules out, fails the
// type check.
import type * as Server from './generated';

/** What `Exact` may say about a server type: only fields it has, with types that fit the server's. */
type Fitting<S, E> = {
  [K in keyof E]: string extends K ? unknown : K extends keyof S ? (NonNullable<E[K]> extends NonNullable<S[K]> ? E[K] : never) : never;
};

/**
 * A server type reduced to what the app uses: `AsIs` fields as the server describes them,
 * `Present` fields that are always there and never null, and `Exact` fields with a narrower type.
 */
type Model<S, AsIs extends keyof S, Present extends keyof S = never, Exact extends Fitting<S, Exact> = Record<never, never>> = Pick<
  S,
  AsIs
> & {
  [K in Present]-?: NonNullable<S[K]>;
} & Exact;

export type ItemType = Server.BaseItemKind;

export type CollectionType = Server.CollectionType;

export type ImageType = Server.ImageType;

export type UserItemData = Model<
  Server.UserItemDataDto,
  | 'PlaybackPositionTicks'
  | 'PlayCount'
  | 'IsFavorite'
  | 'Played'
  | 'PlayedPercentage'
  | 'UnplayedItemCount'
  | 'LastPlayedDate'
  | 'Key'
  | 'ItemId'
>;

export type MediaStream = Model<
  Server.MediaStream,
  | 'Codec'
  | 'Language'
  | 'DisplayTitle'
  | 'Title'
  | 'IsDefault'
  | 'IsForced'
  | 'IsExternal'
  | 'IsTextSubtitleStream'
  | 'SupportsExternalStream'
  | 'DeliveryMethod'
  | 'DeliveryUrl'
  | 'Channels'
  | 'ChannelLayout'
  | 'BitRate'
  | 'Width'
  | 'Height'
  | 'AverageFrameRate'
  | 'RealFrameRate'
  | 'Profile'
  | 'VideoRange'
  | 'VideoRangeType'
  | 'SampleRate'
  | 'BitDepth',
  'Type' | 'Index'
>;

/** A file embedded in a media file, such as a font used by its subtitles. */
export type MediaAttachment = Model<Server.MediaAttachment, 'Codec' | 'FileName' | 'MimeType' | 'DeliveryUrl', 'Index'>;

export type MediaSourceInfo = Model<
  Server.MediaSourceInfo,
  | 'Name'
  | 'Path'
  | 'Protocol'
  | 'Container'
  | 'Size'
  | 'Bitrate'
  | 'RunTimeTicks'
  | 'ETag'
  | 'SupportsDirectPlay'
  | 'SupportsDirectStream'
  | 'SupportsTranscoding'
  | 'TranscodingUrl'
  | 'TranscodingSubProtocol'
  | 'TranscodingContainer'
  | 'DefaultAudioStreamIndex'
  | 'DefaultSubtitleStreamIndex'
  | 'LiveStreamId'
  // A live broadcast: it has no end and no fixed start. */
  | 'IsInfiniteStream',
  'Id',
  {
    MediaStreams?: MediaStream[];
    MediaAttachments?: MediaAttachment[];
  }
>;

export interface NameIdPair {
  Name: string;
  Id: string;
}

export type BaseItemPerson = Model<Server.BaseItemPerson, 'Role' | 'Type' | 'PrimaryImageTag', 'Name' | 'Id'>;

export type ChapterInfo = Model<Server.ChapterInfo, 'Name' | 'ImageTag', 'StartPositionTicks'>;

export type BaseItemDto = Model<
  Server.BaseItemDto,
  // Live TV: channels carry their number and what is on, programmes their channel and times,
  // and whether they will be recorded (TimerId) or are part of a series that will be.
  | 'ChannelNumber'
  | 'TimerId'
  | 'SeriesTimerId'
  | 'IsSeries'
  | 'EpisodeTitle'
  | 'ChannelId'
  | 'ChannelName'
  | 'StartDate'
  | 'Name'
  | 'OriginalTitle'
  | 'ServerId'
  | 'MediaType'
  | 'ParentId'
  | 'Overview'
  | 'ProductionYear'
  | 'PremiereDate'
  | 'EndDate'
  | 'DateCreated'
  | 'Status'
  | 'OfficialRating'
  | 'CommunityRating'
  | 'CriticRating'
  | 'RunTimeTicks'
  | 'ChildCount'
  | 'RecursiveItemCount'
  | 'SeriesId'
  | 'SeriesName'
  | 'SeasonId'
  | 'SeasonName'
  | 'IndexNumber'
  | 'IndexNumberEnd'
  | 'ParentIndexNumber'
  | 'Album'
  | 'AlbumId'
  | 'AlbumArtist'
  | 'AlbumPrimaryImageTag'
  | 'ParentBackdropItemId'
  | 'ParentThumbItemId'
  | 'ParentThumbImageTag'
  | 'ParentPrimaryImageItemId'
  | 'ParentPrimaryImageTag'
  | 'ParentLogoItemId'
  | 'ParentLogoImageTag'
  | 'SeriesPrimaryImageTag'
  | 'SeriesThumbImageTag'
  | 'PrimaryImageAspectRatio'
  | 'Path'
  // Id of this entry in its playlist (only on items listed from a playlist). */
  | 'PlaylistItemId'
  | 'LocationType'
  | 'Width'
  | 'Height'
  | 'SpecialFeatureCount'
  | 'PlayAccess'
  | 'Container',
  'Id',
  {
    CurrentProgram?: BaseItemDto | null;
    Type: ItemType;
    CollectionType?: CollectionType | null;
    IsFolder?: boolean;
    Taglines?: string[];
    Genres?: string[];
    GenreItems?: NameIdPair[];
    Studios?: NameIdPair[];
    People?: BaseItemPerson[];
    Tags?: string[];
    AlbumArtists?: NameIdPair[];
    ArtistItems?: NameIdPair[];
    Artists?: string[];
    ImageTags?: Partial<Record<ImageType, string>>;
    BackdropImageTags?: string[];
    ParentBackdropImageTags?: string[];
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
    CanDelete?: boolean;
    CanDownload?: boolean;
  }
>;

export type TrickplayInfo = Model<
  Server.TrickplayInfoDto,
  'Bandwidth',
  | 'Width'
  | 'Height'
  | 'TileWidth'
  | 'TileHeight'
  | 'ThumbnailCount'
  // Milliseconds between thumbnails. */
  | 'Interval'
>;

/** A scheduled recording of one programme. */
export type TimerInfo = Model<
  Server.TimerInfoDto,
  'Id' | 'ProgramId' | 'ChannelName' | 'Name' | 'Status' | 'SeriesTimerId' | 'PrePaddingSeconds' | 'PostPaddingSeconds',
  'ChannelId' | 'StartDate' | 'EndDate',
  { ProgramInfo?: BaseItemDto | null }
>;

/** A recurring recording: every airing of a series. */
export type SeriesTimerInfo = Model<
  Server.SeriesTimerInfoDto,
  | 'Id'
  | 'ProgramId'
  | 'ChannelName'
  | 'Name'
  | 'RecordAnyTime'
  | 'RecordAnyChannel'
  | 'RecordNewOnly'
  | 'KeepUpTo'
  | 'PrePaddingSeconds'
  | 'PostPaddingSeconds',
  'ChannelId'
>;

export interface ItemsResult<T = BaseItemDto> {
  Items: T[];
  TotalRecordCount: number;
  StartIndex?: number;
}

export type UserPolicy = Model<
  Server.UserPolicy,
  | 'EnableCollectionManagement'
  | 'EnableSubtitleManagement'
  | 'EnableLyricManagement'
  | 'AuthenticationProviderId'
  | 'PasswordResetProviderId'
  | 'SyncPlayAccess'
  | 'MaxParentalRating'
  | 'MaxParentalSubRating'
  | 'BlockUnratedItems'
  | 'AccessSchedules',
  | 'IsAdministrator'
  | 'IsHidden'
  | 'IsDisabled'
  | 'EnableUserPreferenceAccess'
  | 'EnableRemoteControlOfOtherUsers'
  | 'EnableSharedDeviceControl'
  | 'EnableRemoteAccess'
  | 'EnableLiveTvManagement'
  | 'EnableLiveTvAccess'
  | 'EnableMediaPlayback'
  | 'EnableAudioPlaybackTranscoding'
  | 'EnableVideoPlaybackTranscoding'
  | 'EnablePlaybackRemuxing'
  | 'ForceRemoteSourceTranscoding'
  | 'EnableContentDeletion'
  | 'EnableContentDeletionFromFolders'
  | 'EnableContentDownloading'
  | 'EnableSyncTranscoding'
  | 'EnableMediaConversion'
  | 'EnableAllDevices'
  | 'EnabledDevices'
  | 'EnableAllChannels'
  | 'EnabledChannels'
  | 'EnableAllFolders'
  | 'EnabledFolders'
  | 'InvalidLoginAttemptCount'
  | 'LoginAttemptsBeforeLockout'
  | 'MaxActiveSessions'
  | 'EnablePublicSharing'
  | 'RemoteClientBitrateLimit',
  {
    BlockedTags?: string[];
    AllowedTags?: string[];
    [key: string]: unknown;
  }
>;

export type UserConfiguration = Model<
  Server.UserConfiguration,
  'AudioLanguagePreference' | 'SubtitleLanguagePreference',
  | 'PlayDefaultAudioTrack'
  | 'DisplayMissingEpisodes'
  | 'SubtitleMode'
  | 'EnableNextEpisodeAutoPlay'
  | 'RememberAudioSelections'
  | 'RememberSubtitleSelections'
  | 'HidePlayedInLatest',
  {
    [key: string]: unknown;
  }
>;

export type UserDto = Model<
  Server.UserDto,
  'PrimaryImageTag' | 'LastLoginDate' | 'LastActivityDate',
  'Id' | 'Name' | 'HasPassword' | 'HasConfiguredPassword',
  {
    ServerId?: string;
    Policy: UserPolicy;
    Configuration: UserConfiguration;
  }
>;

export type AuthenticationResult = Model<
  Server.AuthenticationResult,
  never,
  'AccessToken' | 'ServerId',
  {
    User: UserDto;
  }
>;

export type PublicSystemInfo = Model<
  Server.PublicSystemInfo,
  never,
  never,
  {
    LocalAddress?: string;
    ServerName?: string;
    Version?: string;
    ProductName?: string;
    Id?: string;
    StartupWizardCompleted?: boolean;
  }
>;

export type SystemInfo = PublicSystemInfo &
  Model<
    Server.SystemInfo,
    | 'HasPendingRestart'
    | 'IsShuttingDown'
    | 'SupportsLibraryMonitor'
    | 'WebSocketPortNumber'
    | 'CanSelfRestart'
    | 'CanLaunchWebBrowser'
    | 'HasUpdateAvailable',
    never,
    {
      OperatingSystemDisplayName?: string;
      OperatingSystem?: string;
      ProgramDataPath?: string;
      WebPath?: string;
      ItemsByNamePath?: string;
      CachePath?: string;
      LogPath?: string;
      InternalMetadataPath?: string;
      TranscodingTempPath?: string;
      EncoderLocation?: string;
      SystemArchitecture?: string;
      PackageName?: string;
    }
  >;

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

export type TranscodingInfo = Model<
  Server.TranscodingInfo,
  | 'AudioCodec'
  | 'VideoCodec'
  | 'Container'
  | 'IsVideoDirect'
  | 'IsAudioDirect'
  | 'Bitrate'
  | 'Framerate'
  | 'CompletionPercentage'
  | 'Width'
  | 'Height'
  | 'AudioChannels'
  | 'HardwareAccelerationType'
> & {
  // The server's API description has a single reason here; what it sends is a list of them.
  TranscodeReasons?: string[];
};

export type PlayerStateInfo = Model<
  Server.PlayerStateInfo,
  | 'PositionTicks'
  | 'CanSeek'
  | 'IsPaused'
  | 'IsMuted'
  | 'VolumeLevel'
  | 'AudioStreamIndex'
  | 'SubtitleStreamIndex'
  | 'MediaSourceId'
  | 'PlayMethod'
>;

export type SessionInfo = Model<
  Server.SessionInfoDto,
  | 'UserId'
  | 'UserName'
  | 'Client'
  | 'DeviceName'
  | 'DeviceId'
  | 'ApplicationVersion'
  | 'RemoteEndPoint'
  | 'LastActivityDate'
  | 'LastPlaybackCheckIn'
  | 'IsActive'
  | 'SupportsRemoteControl',
  'Id',
  {
    NowPlayingItem?: BaseItemDto | null;
    PlayState?: PlayerStateInfo;
  }
> & {
  // Not held against the server's description, which is wrong about the reasons (see TranscodingInfo).
  TranscodingInfo?: TranscodingInfo | null;
};

export type VirtualFolderInfo = Model<
  Server.VirtualFolderInfo,
  'CollectionType' | 'PrimaryImageItemId' | 'RefreshProgress' | 'RefreshStatus',
  'Name' | 'Locations' | 'ItemId',
  {
    LibraryOptions?: Record<string, unknown> & {
      PathInfos?: { Path: string; NetworkPath?: string | null }[];
    };
  }
>;

export type TaskResult = Model<
  Server.TaskResult,
  'StartTimeUtc' | 'EndTimeUtc' | 'Status' | 'ErrorMessage' | 'LongErrorMessage',
  never,
  {
    Name?: string;
    Key?: string;
    Id?: string;
  }
>;

export type TaskInfo = Model<
  Server.TaskInfo,
  'CurrentProgressPercentage' | 'Triggers' | 'IsHidden',
  'Name' | 'State' | 'Id',
  {
    LastExecutionResult?: TaskResult | null;
    Description?: string;
    Category?: string;
    Key?: string;
  }
>;

export type ActivityLogEntry = Model<
  Server.ActivityLogEntry,
  'Overview' | 'ShortOverview' | 'ItemId' | 'UserPrimaryImageTag',
  'Id' | 'Name' | 'Type' | 'Date' | 'UserId' | 'Severity'
>;

export type DeviceInfo = Model<
  Server.DeviceInfoDto,
  'Name' | 'CustomName' | 'AccessToken' | 'LastUserName' | 'AppName' | 'AppVersion',
  'Id',
  {
    LastUserId?: string;
    DateLastActivity?: string;
  }
>;

export type PluginInfo = Model<
  Server.PluginInfo,
  'ConfigurationFileName',
  'Name' | 'Version' | 'Description' | 'Id' | 'CanUninstall' | 'HasImage' | 'Status'
>;

export type ConfigurationPageInfo = Model<Server.ConfigurationPageInfo, 'DisplayName' | 'PluginId' | 'EnableInMainMenu', 'Name'>;

export type VersionInfo = Model<
  Server.VersionInfo,
  'VersionNumber' | 'changelog' | 'targetAbi' | 'sourceUrl' | 'checksum' | 'timestamp' | 'repositoryName' | 'repositoryUrl',
  'version'
>;

export type PackageInfo = Model<
  Server.PackageInfo,
  'imageUrl',
  'name' | 'description' | 'overview' | 'owner' | 'category' | 'guid',
  {
    versions: VersionInfo[];
  }
>;

export type LogFile = Model<Server.LogFile, never, 'DateCreated' | 'DateModified' | 'Size' | 'Name'>;

export type AuthenticationInfo = Model<
  Server.AuthenticationInfo,
  'DeviceId' | 'AppName' | 'AppVersion' | 'DeviceName' | 'UserId' | 'IsActive' | 'DateRevoked' | 'DateLastActivity' | 'UserName',
  'Id' | 'AccessToken' | 'DateCreated'
>;

export type FileSystemEntryInfo = Model<Server.FileSystemEntryInfo, never, 'Name' | 'Path' | 'Type'>;

export type CultureDto = Model<
  Server.CultureDto,
  'ThreeLetterISOLanguageName' | 'ThreeLetterISOLanguageNames',
  'Name' | 'DisplayName' | 'TwoLetterISOLanguageName'
>;

export type CountryInfo = Model<Server.CountryInfo, 'Name' | 'DisplayName' | 'TwoLetterISORegionName' | 'ThreeLetterISORegionName'>;

export type ItemCounts = Model<
  Server.ItemCounts,
  never,
  | 'MovieCount'
  | 'SeriesCount'
  | 'EpisodeCount'
  | 'ArtistCount'
  | 'ProgramCount'
  | 'TrailerCount'
  | 'SongCount'
  | 'AlbumCount'
  | 'MusicVideoCount'
  | 'BoxSetCount'
  | 'BookCount'
  | 'ItemCount'
>;

export type QuickConnectResult = Model<
  Server.QuickConnectResult,
  'DeviceId' | 'DeviceName' | 'AppName' | 'AppVersion' | 'DateAdded',
  'Authenticated' | 'Secret' | 'Code'
>;

export type PlaybackInfoResponse = Model<
  Server.PlaybackInfoResponse,
  'PlaySessionId' | 'ErrorCode',
  never,
  {
    MediaSources: MediaSourceInfo[];
  }
>;

export type MediaSegment = Model<Server.MediaSegmentDto, never, 'Id' | 'ItemId' | 'Type' | 'StartTicks' | 'EndTicks'>;

/** One line of a song's lyrics; `Start` (ticks) only when the lyrics are timed (LRC). */
export type LyricLine = Model<Server.LyricLine, 'Start', 'Text'>;

/** A song's lyrics (Jellyfin 10.9+, /Audio/{id}/Lyrics). */
export type Lyrics = Model<Server.LyricDto, never, never, { Lyrics?: LyricLine[] }>;

export type QueryFilters = Model<
  Server.QueryFilters,
  never,
  never,
  {
    Genres?: NameIdPair[];
    Tags?: string[];
  }
>;

/** Answer of the older /Items/Filters endpoint, which also knows the years and age ratings. */
export type LegacyQueryFilters = Model<Server.QueryFiltersLegacy, 'Genres' | 'Tags' | 'OfficialRatings' | 'Years'>;

export type EncodingOptions = Record<string, unknown> &
  Model<
    Server.EncodingOptions,
    'EncoderPreset' | 'TranscodingTempPath',
    | 'EncodingThreadCount'
    | 'HardwareAccelerationType'
    | 'EnableHardwareEncoding'
    | 'HardwareDecodingCodecs'
    | 'EnableThrottling'
    | 'ThrottleDelaySeconds'
    | 'EnableSegmentDeletion'
    | 'SegmentKeepSeconds'
    | 'EnableTonemapping'
    | 'H264Crf'
    | 'H265Crf'
    | 'AllowHevcEncoding'
    | 'AllowAv1Encoding'
    | 'VaapiDevice'
    | 'DownMixAudioBoost'
    | 'EnableDecodingColorDepth10Hevc'
    | 'EnableDecodingColorDepth10Vp9'
    | 'EnableSubtitleExtraction',
    {
      QsvDevice?: string;
    }
  >;

export type NetworkConfiguration = Record<string, unknown> &
  Model<
    Server.NetworkConfiguration,
    never,
    | 'BaseUrl'
    | 'EnableHttps'
    | 'RequireHttps'
    | 'InternalHttpPort'
    | 'InternalHttpsPort'
    | 'PublicHttpPort'
    | 'PublicHttpsPort'
    | 'AutoDiscovery'
    | 'EnableUPnP'
    | 'EnableIPv4'
    | 'EnableIPv6'
    | 'EnableRemoteAccess'
    | 'LocalNetworkSubnets'
    | 'LocalNetworkAddresses'
    | 'KnownProxies'
    | 'RemoteIPFilter'
    | 'IsRemoteIPFilterBlacklist'
  >;

export type ServerConfiguration = Record<string, unknown> &
  Model<
    Server.ServerConfiguration,
    'CachePath' | 'ActivityLogRetentionDays' | 'LibraryScanFanoutConcurrency' | 'ParallelImageEncodingLimit',
    | 'ServerName'
    | 'PreferredMetadataLanguage'
    | 'MetadataCountryCode'
    | 'UICulture'
    | 'QuickConnectAvailable'
    | 'MetadataPath'
    | 'MinResumePct'
    | 'MaxResumePct'
    | 'MinResumeDurationSeconds'
    | 'MinAudiobookResume'
    | 'MaxAudiobookResume'
    | 'LibraryMonitorDelay'
    | 'RemoteClientBitrateLimit'
    | 'EnableFolderView'
    | 'EnableGroupingMoviesIntoCollections'
    | 'EnableGroupingShowsIntoCollections'
    | 'DisplaySpecialsWithinSeasons'
    | 'EnableExternalContentInSuggestions'
  >;
