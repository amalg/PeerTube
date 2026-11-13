import { SearchTargetQuery } from './search-target-query.model.js'
import { VideosCommonQuery } from './videos-common-query.model.js'

type VideoChannelsListVideoFilters = Pick<VideosCommonQuery, 'nsfw' | 'nsfwFlagsIncluded' | 'nsfwFlagsExcluded'>

// Ranking and filtering of channel lists by the videos the requester can see in each channel
// The video filters are the ones of the channel video list
export interface VideoChannelsListFiltersQuery extends VideoChannelsListVideoFilters {
  // Period of the "recentViews" sort, in days
  recentViewsDays?: number

  // Only list channels with at least one video the requester can see
  hasVideos?: boolean
}

export interface VideoChannelsSearchQuery extends SearchTargetQuery, VideoChannelsListFiltersQuery {
  search?: string

  start?: number
  count?: number
  sort?: string

  host?: string
  handles?: string[]
}

export interface VideoChannelsSearchQueryAfterSanitize extends VideoChannelsSearchQuery {
  start: number
  count: number
  sort: string
}

export interface VideoChannelsListQuery extends VideoChannelsListFiltersQuery {
  start?: number
  count?: number
  sort?: string
}
