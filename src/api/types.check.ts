/**
 * Compile-time check of the hand-written API types against the ones generated from the server's
 * OpenAPI document (generated.ts, `npm run generate:api`). Nothing here runs: if a hand-written
 * type names a field the server does not have (a typo, or a field a newer server dropped), the
 * type check fails on the line for that type and names the field.
 */
import type * as Server from './generated';
import type * as App from './types';

/** The named fields of a type, without what an index signature would add. */
type Fields<T> = keyof { [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K] };
/** Fields of the app's type that the server's type does not have. */
type Unknown<Hand, Gen, Allowed = never> = Exclude<Fields<Hand>, Fields<Gen> | Allowed>;
/** Accepts only "no fields": anything else is an error that shows the offending names. */
type None<T extends never> = T;

export type Checks = [
  None<Unknown<App.BaseItemDto, Server.BaseItemDto>>,
  None<Unknown<App.UserItemData, Server.UserItemDataDto>>,
  None<Unknown<App.MediaStream, Server.MediaStream>>,
  None<Unknown<App.MediaAttachment, Server.MediaAttachment>>,
  None<Unknown<App.MediaSourceInfo, Server.MediaSourceInfo>>,
  None<Unknown<App.BaseItemPerson, Server.BaseItemPerson>>,
  None<Unknown<App.ChapterInfo, Server.ChapterInfo>>,
  None<Unknown<App.TrickplayInfo, Server.TrickplayInfoDto>>,
  None<Unknown<App.UserPolicy, Server.UserPolicy>>,
  None<Unknown<App.UserConfiguration, Server.UserConfiguration>>,
  None<Unknown<App.UserDto, Server.UserDto>>,
  None<Unknown<App.AuthenticationResult, Server.AuthenticationResult>>,
  None<Unknown<App.PublicSystemInfo, Server.PublicSystemInfo>>,
  None<Unknown<App.SystemInfo, Server.SystemInfo>>,
  None<Unknown<App.TranscodingInfo, Server.TranscodingInfo>>,
  None<Unknown<App.PlayerStateInfo, Server.PlayerStateInfo>>,
  None<Unknown<App.SessionInfo, Server.SessionInfoDto>>,
  None<Unknown<App.VirtualFolderInfo, Server.VirtualFolderInfo>>,
  None<Unknown<App.TaskInfo, Server.TaskInfo>>,
  None<Unknown<App.TaskResult, Server.TaskResult>>,
  None<Unknown<App.ActivityLogEntry, Server.ActivityLogEntry>>,
  None<Unknown<App.DeviceInfo, Server.DeviceInfoDto>>,
  None<Unknown<App.PluginInfo, Server.PluginInfo>>,
  None<Unknown<App.PackageInfo, Server.PackageInfo>>,
  None<Unknown<App.VersionInfo, Server.VersionInfo>>,
  None<Unknown<App.LogFile, Server.LogFile>>,
  None<Unknown<App.AuthenticationInfo, Server.AuthenticationInfo>>,
  None<Unknown<App.FileSystemEntryInfo, Server.FileSystemEntryInfo>>,
  None<Unknown<App.CultureDto, Server.CultureDto>>,
  None<Unknown<App.CountryInfo, Server.CountryInfo>>,
  None<Unknown<App.ItemCounts, Server.ItemCounts>>,
  None<Unknown<App.QuickConnectResult, Server.QuickConnectResult>>,
  None<Unknown<App.PlaybackInfoResponse, Server.PlaybackInfoResponse>>,
  None<Unknown<App.MediaSegment, Server.MediaSegmentDto>>,
  None<Unknown<App.LegacyQueryFilters, Server.QueryFiltersLegacy>>,
  None<Unknown<App.QueryFilters, Server.QueryFilters>>,
  None<Unknown<App.NetworkConfiguration, Server.NetworkConfiguration>>,
  None<Unknown<App.ServerConfiguration, Server.ServerConfiguration>>,
  None<Unknown<App.EncodingOptions, Server.EncodingOptions>>,
  None<Unknown<App.ConfigurationPageInfo, Server.ConfigurationPageInfo>>,
];
