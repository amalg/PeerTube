/* oxlint-disable @typescript-eslint/no-unused-expressions,@typescript-eslint/require-await */

import { VideoChannelsSearchQuery, VideoPrivacy, VideoPrivacyType } from '@peertube/peertube-models'
import {
  cleanupTests,
  createSingleServer,
  PeerTubeServer,
  setAccessTokensToServers,
  waitJobs
} from '@peertube/peertube-server-commands'
import { SQLCommand } from '@tests/shared/sql-command.js'
import { expect } from 'chai'

describe('Test channels ranked by recent views', function () {
  let server: PeerTubeServer
  let sqlCommand: SQLCommand
  let userToken: string

  const base: VideoChannelsSearchQuery = {
    searchTarget: 'local',
    sort: '-recentViews',
    hasVideos: true,
    nsfw: 'false'
  }

  function daysAgo (days: number) {
    return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()
  }

  async function search (query: VideoChannelsSearchQuery, token?: string) {
    const body = await server.search.advancedChannelSearch({ search: { host: server.host, ...query }, token })

    return { names: body.data.map(c => c.displayName), total: body.total }
  }

  async function createChannel (name: string, displayName: string) {
    const { id } = await server.channels.create({ attributes: { name, displayName } })

    return id
  }

  async function uploadVideo (options: {
    channelId: number
    privacy?: VideoPrivacyType
    nsfw?: boolean
    views?: number
    viewsDaysAgo?: number
  }) {
    const { channelId, privacy = VideoPrivacy.PUBLIC, nsfw = false, views, viewsDaysAgo = 0 } = options

    const { uuid } = await server.videos.upload({ attributes: { name: 'video', channelId, privacy, nsfw } })

    if (views) {
      await sqlCommand.createVideoStat({ uuid, views, startDate: daysAgo(viewsDaysAgo) })
    }

    return uuid
  }

  before(async function () {
    this.timeout(120000)

    server = await createSingleServer(1)
    await setAccessTokensToServers([ server ])
    await server.config.disableTranscoding()

    sqlCommand = new SQLCommand(server)
    userToken = await server.users.generateUserAndToken('user1')

    const alpha = await createChannel('alpha_channel', 'Alpha')
    await uploadVideo({ channelId: alpha, views: 10 })

    const bravo = await createChannel('bravo_channel', 'Bravo')
    await uploadVideo({ channelId: bravo, views: 5 })
    await uploadVideo({ channelId: bravo, privacy: VideoPrivacy.PRIVATE, views: 100 })

    const charlie = await createChannel('charlie_channel', 'Charlie')
    await uploadVideo({ channelId: charlie, views: 50, viewsDaysAgo: 400 })

    const delta = await createChannel('delta_channel', 'Delta')
    await uploadVideo({ channelId: delta, privacy: VideoPrivacy.INTERNAL, views: 20 })

    await createChannel('echo_channel', 'Echo')

    const foxtrot = await createChannel('foxtrot_channel', 'Foxtrot')
    await uploadVideo({ channelId: foxtrot, privacy: VideoPrivacy.UNLISTED, views: 30 })

    const golf = await createChannel('golf_channel', 'Golf')
    await uploadVideo({ channelId: golf, nsfw: true, views: 40 })

    const hotel = await createChannel('hotel_channel', 'Hotel')
    const hotelVideo = await uploadVideo({ channelId: hotel, views: 60 })
    await server.blacklist.add({ videoId: hotelVideo })

    await waitJobs([ server ])
  })

  it('Should rank channels by views of the last 365 days', async function () {
    const { names, total } = await search(base)

    expect(names).to.deep.equal([ 'Alpha', 'Bravo', 'Charlie' ])
    expect(total).to.equal(3)
  })

  it('Should use the requested period', async function () {
    const { names } = await search({ ...base, recentViewsDays: 500 })

    expect(names).to.deep.equal([ 'Charlie', 'Alpha', 'Bravo' ])
  })

  it('Should count internal videos for signed-in users', async function () {
    const { names } = await search(base, userToken)

    expect(names).to.deep.equal([ 'Delta', 'Alpha', 'Bravo', 'Charlie' ])
  })

  it('Should follow the NSFW filter', async function () {
    const { names } = await search({ ...base, nsfw: 'both' })

    expect(names).to.deep.equal([ 'Golf', 'Alpha', 'Bravo', 'Charlie' ])
  })

  it('Should list channels without views after the ranked ones', async function () {
    const { names } = await search({ ...base, hasVideos: undefined })

    expect(names.slice(0, 2)).to.deep.equal([ 'Alpha', 'Bravo' ])

    const rest = names.slice(2)
    const expectedRest = [ ...rest ].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    expect(rest).to.deep.equal(expectedRest)
    expect(rest).to.include.members([ 'Echo', 'Foxtrot', 'Hotel', 'Main root channel' ])
  })

  it('Should paginate the filtered ranking', async function () {
    {
      const { names, total } = await search({ ...base, count: 2 })

      expect(names).to.deep.equal([ 'Alpha', 'Bravo' ])
      expect(total).to.equal(3)
    }

    {
      const { names, total } = await search({ ...base, start: 2, count: 2 })

      expect(names).to.deep.equal([ 'Charlie' ])
      expect(total).to.equal(3)
    }
  })

  it('Should combine a search with the ranking', async function () {
    // The search also matches account display names, so the text must not occur in "root" or "user1"
    const { names } = await search({ ...base, search: 'ha' })

    expect(names).to.deep.equal([ 'Alpha', 'Charlie' ])
  })

  it('Should rank on the channel list endpoint', async function () {
    const body = await server.channels.list({ sort: '-recentViews', hasVideos: true, nsfw: 'false' })

    expect(body.data.map(c => c.displayName)).to.deep.equal([ 'Alpha', 'Bravo', 'Charlie' ])
  })

  after(async function () {
    await sqlCommand.cleanup()
    await cleanupTests([ server ])
  })
})
