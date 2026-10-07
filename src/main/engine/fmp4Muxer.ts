import fs from 'fs';
import path from 'path';

interface Mp4Box {
  type: string;
  offset: number;
  size: number;
  headerSize: number;
  dataStart: number;
  end: number;
}

interface ParsedSample {
  duration: number;
  size: number;
  flags: number;
  cto: number;
}

interface TrackChunk {
  trackId: number;
  startTimeSec: number;
  sampleCount: number;
  payload: Buffer;
  fileOffset: number;
}

interface TrackDefaults {
  defaultSampleDuration: number;
  defaultSampleSize: number;
  defaultSampleFlags: number;
}

function parseBoxes(buf: Buffer, start = 0, end = buf.length): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  let offset = start;

  while (offset + 8 <= end) {
    let size = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    let headerSize = 8;

    if (size === 1) {
      if (offset + 16 > end) break;
      const bigSize = buf.readBigUInt64BE(offset + 8);
      size = Number(bigSize);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }

    if (size < headerSize || offset + size > end) {
      break;
    }

    boxes.push({
      type,
      offset,
      size,
      headerSize,
      dataStart: offset + headerSize,
      end: offset + size,
    });

    offset += size;
  }

  return boxes;
}

function makeBox(type: string, payload: Buffer): Buffer {
  const out = Buffer.allocUnsafe(8 + payload.length);
  out.writeUInt32BE(out.length, 0);
  out.write(type, 4, 4, 'ascii');
  payload.copy(out, 8);
  return out;
}

function getMovieTimescale(mvhdRaw: Buffer): number {
  const version = mvhdRaw[8];
  const timescaleOffset = 8 + (version === 1 ? 20 : 12);
  if (timescaleOffset + 4 <= mvhdRaw.length) {
    return mvhdRaw.readUInt32BE(timescaleOffset) || 1000;
  }
  return 1000;
}

function patchMvhd(mvhdRaw: Buffer, durationInMovieTimescale: number, nextTrackId: number): Buffer {
  const copy = Buffer.from(mvhdRaw);
  const version = copy[8];
  if (version === 1) {
    if (8 + 32 <= copy.length) {
      copy.writeBigUInt64BE(BigInt(Math.max(0, Math.round(durationInMovieTimescale))), 8 + 24);
    }
  } else {
    if (8 + 20 <= copy.length) {
      copy.writeUInt32BE(Math.min(0xffffffff, Math.max(0, Math.round(durationInMovieTimescale))), 8 + 16);
    }
  }
  if (copy.length >= 108) {
    copy.writeUInt32BE(nextTrackId, copy.length - 4);
  }
  return copy;
}

function getTrackTimescale(trakRaw: Buffer): number {
  const trakChildren = parseBoxes(trakRaw, 8, trakRaw.length);
  const mdia = trakChildren.find((b) => b.type === 'mdia');
  if (!mdia) return 1000;
  const mdiaChildren = parseBoxes(trakRaw, mdia.dataStart, mdia.end);
  const mdhd = mdiaChildren.find((b) => b.type === 'mdhd');
  if (!mdhd) return 1000;
  const version = trakRaw[mdhd.dataStart];
  const offset = mdhd.dataStart + (version === 1 ? 20 : 12);
  if (offset + 4 <= mdhd.end) {
    return trakRaw.readUInt32BE(offset) || 1000;
  }
  return 1000;
}

function extractTrexDefaults(moovBuf: Buffer, moovBox: Mp4Box, targetTrackId?: number): TrackDefaults {
  const defaults: TrackDefaults = {
    defaultSampleDuration: 0,
    defaultSampleSize: 0,
    defaultSampleFlags: 0,
  };
  const moovChildren = parseBoxes(moovBuf, moovBox.dataStart, moovBox.end);
  const mvex = moovChildren.find((b) => b.type === 'mvex');
  if (!mvex) return defaults;
  const mvexChildren = parseBoxes(moovBuf, mvex.dataStart, mvex.end);
  for (const child of mvexChildren) {
    if (child.type === 'trex' && child.dataStart + 24 <= child.end) {
      const tid = moovBuf.readUInt32BE(child.dataStart + 4);
      if (targetTrackId === undefined || tid === targetTrackId) {
        defaults.defaultSampleDuration = moovBuf.readUInt32BE(child.dataStart + 12);
        defaults.defaultSampleSize = moovBuf.readUInt32BE(child.dataStart + 16);
        defaults.defaultSampleFlags = moovBuf.readUInt32BE(child.dataStart + 20);
        break;
      }
    }
  }
  return defaults;
}

function parseTrackFragments(
  buf: Buffer,
  boxes: Mp4Box[],
  outTrackId: number,
  timescale: number,
  defaults: TrackDefaults,
  filterSourceTrackId?: number
): { samples: ParsedSample[]; chunks: TrackChunk[]; totalDuration: number } {
  const samples: ParsedSample[] = [];
  const chunks: TrackChunk[] = [];
  let totalDuration = 0;

  for (let i = 0; i < boxes.length; i++) {
    if (boxes[i].type !== 'moof' || i + 1 >= boxes.length || boxes[i + 1].type !== 'mdat') {
      continue;
    }
    const moofBox = boxes[i];
    const mdatBox = boxes[i + 1];
    i++;

    const moofChildren = parseBoxes(buf, moofBox.dataStart, moofBox.end);
    for (const traf of moofChildren) {
      if (traf.type !== 'traf') continue;
      const trafChildren = parseBoxes(buf, traf.dataStart, traf.end);
      const tfhd = trafChildren.find((b) => b.type === 'tfhd');
      if (!tfhd || tfhd.dataStart + 8 > tfhd.end) continue;

      const tfhdFlags = buf.readUInt32BE(tfhd.dataStart) & 0xffffff;
      const srcTrackId = buf.readUInt32BE(tfhd.dataStart + 4);
      if (filterSourceTrackId !== undefined && srcTrackId !== filterSourceTrackId) {
        continue;
      }

      let pos = tfhd.dataStart + 8;
      if (tfhdFlags & 0x000001) pos += 8; // base_data_offset
      if (tfhdFlags & 0x000002) pos += 4; // sample_description_index
      const defDuration =
        tfhdFlags & 0x000008 && pos + 4 <= tfhd.end
          ? ((pos += 4), buf.readUInt32BE(pos - 4))
          : defaults.defaultSampleDuration;
      const defSize =
        tfhdFlags & 0x000010 && pos + 4 <= tfhd.end
          ? ((pos += 4), buf.readUInt32BE(pos - 4))
          : defaults.defaultSampleSize;
      const defFlags =
        tfhdFlags & 0x000020 && pos + 4 <= tfhd.end
          ? ((pos += 4), buf.readUInt32BE(pos - 4))
          : defaults.defaultSampleFlags;

      let mdatReadOffset = mdatBox.dataStart;
      for (const trun of trafChildren) {
        if (trun.type !== 'trun' || trun.dataStart + 8 > trun.end) continue;
        const trunVersion = buf[trun.dataStart];
        const trunFlags = buf.readUInt32BE(trun.dataStart) & 0xffffff;
        const sampleCount = buf.readUInt32BE(trun.dataStart + 4);
        let tPos = trun.dataStart + 8;

        let dataOffset = 0;
        const hasDataOffset = Boolean(trunFlags & 0x000001);
        if (hasDataOffset && tPos + 4 <= trun.end) {
          dataOffset = buf.readInt32BE(tPos);
          tPos += 4;
        }

        let firstSampleFlags = defFlags;
        if (trunFlags & 0x000004 && tPos + 4 <= trun.end) {
          firstSampleFlags = buf.readUInt32BE(tPos);
          tPos += 4;
        }

        const chunkStartTimeSec = timescale > 0 ? totalDuration / timescale : 0;
        let chunkByteLength = 0;
        let validSampleCount = 0;

        for (let s = 0; s < sampleCount; s++) {
          let sDur = defDuration;
          if (trunFlags & 0x000100 && tPos + 4 <= trun.end) {
            sDur = buf.readUInt32BE(tPos);
            tPos += 4;
          }
          let sSize = defSize;
          if (trunFlags & 0x000200 && tPos + 4 <= trun.end) {
            sSize = buf.readUInt32BE(tPos);
            tPos += 4;
          }
          let sFlags = s === 0 ? firstSampleFlags : defFlags;
          if (trunFlags & 0x000400 && tPos + 4 <= trun.end) {
            sFlags = buf.readUInt32BE(tPos);
            tPos += 4;
          }
          let sCto = 0;
          if (trunFlags & 0x000800 && tPos + 4 <= trun.end) {
            sCto = trunVersion === 0 ? buf.readUInt32BE(tPos) : buf.readInt32BE(tPos);
            tPos += 4;
          }

          if (sSize > 0) {
            samples.push({
              duration: sDur,
              size: sSize,
              flags: sFlags,
              cto: sCto,
            });
            totalDuration += sDur;
            chunkByteLength += sSize;
            validSampleCount++;
          }
        }

        if (validSampleCount > 0 && chunkByteLength > 0) {
          let payloadStart = mdatReadOffset;
          if (hasDataOffset && !(tfhdFlags & 0x000001)) {
            const candidate = moofBox.offset + dataOffset;
            if (candidate >= mdatBox.dataStart && candidate + chunkByteLength <= mdatBox.end) {
              payloadStart = candidate;
            }
          }
          const payloadEnd = Math.min(mdatBox.end, payloadStart + chunkByteLength);
          if (payloadEnd > payloadStart) {
            chunks.push({
              trackId: outTrackId,
              startTimeSec: chunkStartTimeSec,
              sampleCount: validSampleCount,
              payload: buf.subarray(payloadStart, payloadEnd),
              fileOffset: 0,
            });
            mdatReadOffset = payloadEnd;
          }
        }
      }
    }
  }

  return { samples, chunks, totalDuration };
}

function buildSttsBox(samples: ParsedSample[]): Buffer {
  const runs: { count: number; delta: number }[] = [];
  for (const s of samples) {
    const dur = s.duration || 0;
    if (runs.length > 0 && runs[runs.length - 1].delta === dur) {
      runs[runs.length - 1].count++;
    } else {
      runs.push({ count: 1, delta: dur });
    }
  }
  const payload = Buffer.allocUnsafe(8 + runs.length * 8);
  payload.writeUInt32BE(0, 0); // version 0, flags 0
  payload.writeUInt32BE(runs.length, 4);
  for (let i = 0; i < runs.length; i++) {
    payload.writeUInt32BE(runs[i].count, 8 + i * 8);
    payload.writeUInt32BE(runs[i].delta, 12 + i * 8);
  }
  return makeBox('stts', payload);
}

function buildCttsBox(samples: ParsedSample[]): Buffer | null {
  const hasNonZero = samples.some((s) => s.cto !== 0);
  if (!hasNonZero) return null;

  const hasNegative = samples.some((s) => s.cto < 0);
  const runs: { count: number; offset: number }[] = [];
  for (const s of samples) {
    if (runs.length > 0 && runs[runs.length - 1].offset === s.cto) {
      runs[runs.length - 1].count++;
    } else {
      runs.push({ count: 1, offset: s.cto });
    }
  }

  const payload = Buffer.allocUnsafe(8 + runs.length * 8);
  payload.writeUInt32BE(hasNegative ? 0x01000000 : 0, 0);
  payload.writeUInt32BE(runs.length, 4);
  for (let i = 0; i < runs.length; i++) {
    payload.writeUInt32BE(runs[i].count, 8 + i * 8);
    if (hasNegative) {
      payload.writeInt32BE(runs[i].offset, 12 + i * 8);
    } else {
      payload.writeUInt32BE(runs[i].offset >>> 0, 12 + i * 8);
    }
  }
  return makeBox('ctts', payload);
}

function buildStssBox(samples: ParsedSample[]): Buffer {
  const syncNumbers: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const flags = samples[i].flags;
    const isNonSync = (flags & 0x00010000) !== 0;
    const dependsOn = (flags >>> 24) & 0x03;
    if (!isNonSync && dependsOn !== 1) {
      syncNumbers.push(i + 1);
    }
  }
  if (syncNumbers.length === 0 && samples.length > 0) {
    syncNumbers.push(1);
  }
  const payload = Buffer.allocUnsafe(8 + syncNumbers.length * 4);
  payload.writeUInt32BE(0, 0);
  payload.writeUInt32BE(syncNumbers.length, 4);
  for (let i = 0; i < syncNumbers.length; i++) {
    payload.writeUInt32BE(syncNumbers[i], 8 + i * 4);
  }
  return makeBox('stss', payload);
}

function buildStscBox(chunks: TrackChunk[]): Buffer {
  const entries: { firstChunk: number; samplesPerChunk: number; sampleDescIndex: number }[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const spc = chunks[i].sampleCount;
    if (entries.length === 0 || entries[entries.length - 1].samplesPerChunk !== spc) {
      entries.push({
        firstChunk: i + 1,
        samplesPerChunk: spc,
        sampleDescIndex: 1,
      });
    }
  }
  const payload = Buffer.allocUnsafe(8 + entries.length * 12);
  payload.writeUInt32BE(0, 0);
  payload.writeUInt32BE(entries.length, 4);
  for (let i = 0; i < entries.length; i++) {
    payload.writeUInt32BE(entries[i].firstChunk, 8 + i * 12);
    payload.writeUInt32BE(entries[i].samplesPerChunk, 12 + i * 12);
    payload.writeUInt32BE(entries[i].sampleDescIndex, 16 + i * 12);
  }
  return makeBox('stsc', payload);
}

function buildStszBox(samples: ParsedSample[]): Buffer {
  const payload = Buffer.allocUnsafe(12 + samples.length * 4);
  payload.writeUInt32BE(0, 0); // version/flags
  payload.writeUInt32BE(0, 4); // sample_size = 0 (variable)
  payload.writeUInt32BE(samples.length, 8);
  for (let i = 0; i < samples.length; i++) {
    payload.writeUInt32BE(samples[i].size, 12 + i * 4);
  }
  return makeBox('stsz', payload);
}

function buildChunkOffsetBox(chunks: TrackChunk[], use64Bit: boolean): Buffer {
  if (use64Bit) {
    const payload = Buffer.allocUnsafe(8 + chunks.length * 8);
    payload.writeUInt32BE(0, 0);
    payload.writeUInt32BE(chunks.length, 4);
    for (let i = 0; i < chunks.length; i++) {
      payload.writeBigUInt64BE(BigInt(chunks[i].fileOffset), 8 + i * 8);
    }
    return makeBox('co64', payload);
  } else {
    const payload = Buffer.allocUnsafe(8 + chunks.length * 4);
    payload.writeUInt32BE(0, 0);
    payload.writeUInt32BE(chunks.length, 4);
    for (let i = 0; i < chunks.length; i++) {
      payload.writeUInt32BE(chunks[i].fileOffset >>> 0, 8 + i * 4);
    }
    return makeBox('stco', payload);
  }
}

function rebuildStandardTrak(
  trakRaw: Buffer,
  newTrackId: number,
  isVideo: boolean,
  samples: ParsedSample[],
  chunks: TrackChunk[],
  totalTrackDuration: number,
  trackTimescale: number,
  movieTimescale: number,
  use64BitOffsets: boolean
): Buffer {
  const trakChildren = parseBoxes(trakRaw, 8, trakRaw.length);
  const newTrakChildren: Buffer[] = [];

  const durationInMovieTimescale =
    trackTimescale > 0 ? Math.round((totalTrackDuration / trackTimescale) * movieTimescale) : 0;

  for (const child of trakChildren) {
    if (child.type === 'tkhd') {
      const tkhdCopy = Buffer.from(trakRaw.subarray(child.offset, child.end));
      // Ensure track_enabled | track_in_movie | track_in_preview flags (0x000003)
      tkhdCopy[11] = tkhdCopy[11] | 0x03;
      const version = tkhdCopy[8];
      if (version === 1) {
        if (8 + 24 <= tkhdCopy.length) tkhdCopy.writeUInt32BE(newTrackId, 8 + 20);
        if (8 + 36 <= tkhdCopy.length) {
          tkhdCopy.writeBigUInt64BE(BigInt(Math.max(0, durationInMovieTimescale)), 8 + 28);
        }
      } else {
        if (8 + 16 <= tkhdCopy.length) tkhdCopy.writeUInt32BE(newTrackId, 8 + 12);
        if (8 + 24 <= tkhdCopy.length) {
          tkhdCopy.writeUInt32BE(Math.min(0xffffffff, Math.max(0, durationInMovieTimescale)), 8 + 20);
        }
      }
      newTrakChildren.push(tkhdCopy);
    } else if (child.type === 'edts') {
      // Omit fragmented empty/offset edit list so standard MP4 starts cleanly at t=0
      continue;
    } else if (child.type === 'mdia') {
      const mdiaChildren = parseBoxes(trakRaw, child.dataStart, child.end);
      const newMdiaChildren: Buffer[] = [];

      for (const mChild of mdiaChildren) {
        if (mChild.type === 'mdhd') {
          const mdhdCopy = Buffer.from(trakRaw.subarray(mChild.offset, mChild.end));
          const version = mdhdCopy[8];
          if (version === 1) {
            if (8 + 32 <= mdhdCopy.length) {
              mdhdCopy.writeBigUInt64BE(BigInt(Math.max(0, totalTrackDuration)), 8 + 24);
            }
          } else {
            if (8 + 20 <= mdhdCopy.length) {
              mdhdCopy.writeUInt32BE(Math.min(0xffffffff, Math.max(0, totalTrackDuration)), 8 + 16);
            }
          }
          newMdiaChildren.push(mdhdCopy);
        } else if (mChild.type === 'minf') {
          const minfChildren = parseBoxes(trakRaw, mChild.dataStart, mChild.end);
          const newMinfChildren: Buffer[] = [];

          for (const minfChild of minfChildren) {
            if (minfChild.type === 'stbl') {
              const stblChildren = parseBoxes(trakRaw, minfChild.dataStart, minfChild.end);
              const stsd = stblChildren.find((b) => b.type === 'stsd');
              if (!stsd) continue;

              const stblParts: Buffer[] = [trakRaw.subarray(stsd.offset, stsd.end)];
              stblParts.push(buildSttsBox(samples));
              const ctts = buildCttsBox(samples);
              if (ctts) stblParts.push(ctts);
              if (isVideo) {
                stblParts.push(buildStssBox(samples));
              }
              stblParts.push(buildStscBox(chunks));
              stblParts.push(buildStszBox(samples));
              stblParts.push(buildChunkOffsetBox(chunks, use64BitOffsets));

              newMinfChildren.push(makeBox('stbl', Buffer.concat(stblParts)));
            } else {
              newMinfChildren.push(trakRaw.subarray(minfChild.offset, minfChild.end));
            }
          }
          newMdiaChildren.push(makeBox('minf', Buffer.concat(newMinfChildren)));
        } else {
          newMdiaChildren.push(trakRaw.subarray(mChild.offset, mChild.end));
        }
      }
      newTrakChildren.push(makeBox('mdia', Buffer.concat(newMdiaChildren)));
    } else {
      newTrakChildren.push(trakRaw.subarray(child.offset, child.end));
    }
  }

  return makeBox('trak', Buffer.concat(newTrakChildren));
}

/**
 * Merges a fragmented MP4 (fMP4) video file and a fragmented MP4 (fMP4/M4A) audio file
 * (or defragments a dual-track fMP4 when videoPath === audioPath) into a universal,
 * non-fragmented standard ISO MP4 file (`ftyp` + `moov` + `mdat`) with full sample tables.
 */
export function muxFmp4VideoAndAudio(videoPath: string, audioPath: string, outputPath: string): boolean {
  try {
    if (!fs.existsSync(videoPath) || !fs.existsSync(audioPath)) {
      return false;
    }

    const sameInput = path.resolve(videoPath) === path.resolve(audioPath);
    const videoBuf = fs.readFileSync(videoPath);
    const audioBuf = sameInput ? videoBuf : fs.readFileSync(audioPath);

    const videoBoxes = parseBoxes(videoBuf);
    const audioBoxes = sameInput ? videoBoxes : parseBoxes(audioBuf);

    const vFtyp = videoBoxes.find((b) => b.type === 'ftyp');
    const vMoov = videoBoxes.find((b) => b.type === 'moov');
    const aMoov = sameInput ? vMoov : audioBoxes.find((b) => b.type === 'moov');

    if (!vFtyp || !vMoov || !aMoov) {
      return false;
    }

    const vMoovChildren = parseBoxes(videoBuf, vMoov.dataStart, vMoov.end);
    const aMoovChildren = sameInput ? vMoovChildren : parseBoxes(audioBuf, aMoov.dataStart, aMoov.end);

    const vMvhd = vMoovChildren.find((b) => b.type === 'mvhd');
    const vTraks = vMoovChildren.filter((b) => b.type === 'trak');
    const aTraks = aMoovChildren.filter((b) => b.type === 'trak');

    const vTrak = vTraks[0];
    const aTrak = sameInput ? vTraks[1] : aTraks[0];

    if (!vMvhd || !vTrak || !aTrak) {
      return false;
    }

    const mvhdRaw = videoBuf.subarray(vMvhd.offset, vMvhd.end);
    const vTrakRaw = videoBuf.subarray(vTrak.offset, vTrak.end);
    const aTrakRaw = audioBuf.subarray(aTrak.offset, aTrak.end);

    const movieTimescale = getMovieTimescale(mvhdRaw);
    const vTimescale = getTrackTimescale(vTrakRaw);
    const aTimescale = getTrackTimescale(aTrakRaw);

    const vDefaults = extractTrexDefaults(videoBuf, vMoov, sameInput ? 1 : undefined);
    const aDefaults = extractTrexDefaults(audioBuf, aMoov, sameInput ? 2 : undefined);

    const vParsed = parseTrackFragments(
      videoBuf,
      videoBoxes,
      1,
      vTimescale,
      vDefaults,
      sameInput ? 1 : undefined
    );
    const aParsed = parseTrackFragments(
      audioBuf,
      audioBoxes,
      2,
      aTimescale,
      aDefaults,
      sameInput ? 2 : undefined
    );

    if (vParsed.samples.length === 0 || aParsed.samples.length === 0) {
      return false;
    }

    // Interleave video and audio chunks chronologically by startTimeSec
    const interleavedChunks: TrackChunk[] = [...vParsed.chunks, ...aParsed.chunks].sort(
      (a, b) => a.startTimeSec - b.startTimeSec || a.trackId - b.trackId
    );

    let totalMdatPayloadBytes = 0;
    for (const chunk of interleavedChunks) {
      totalMdatPayloadBytes += chunk.payload.length;
    }

    const vDurationInMovieTs = vTimescale > 0 ? Math.round((vParsed.totalDuration / vTimescale) * movieTimescale) : 0;
    const aDurationInMovieTs = aTimescale > 0 ? Math.round((aParsed.totalDuration / aTimescale) * movieTimescale) : 0;
    const maxMovieDuration = Math.max(vDurationInMovieTs, aDurationInMovieTs);

    const patchedMvhd = patchMvhd(mvhdRaw, maxMovieDuration, 3);
    const ftypBuf = Buffer.alloc(32);
    ftypBuf.writeUInt32BE(32, 0);
    ftypBuf.write('ftypisom', 4, 8, 'ascii');
    ftypBuf.writeUInt32BE(0x200, 12);
    ftypBuf.write('isomiso2avc1mp41', 16, 16, 'ascii');

    // Estimate if 64-bit chunk offsets are needed (> 3.8 GB)
    const use64Bit = totalMdatPayloadBytes > 0xe0000000;
    const mdatHeaderSize = totalMdatPayloadBytes + 8 > 0xffffffff ? 16 : 8;

    // Pass 1: Build dummy moov to measure exact header size
    const dummyVTrak = rebuildStandardTrak(
      vTrakRaw,
      1,
      true,
      vParsed.samples,
      vParsed.chunks,
      vParsed.totalDuration,
      vTimescale,
      movieTimescale,
      use64Bit
    );
    const dummyATrak = rebuildStandardTrak(
      aTrakRaw,
      2,
      false,
      aParsed.samples,
      aParsed.chunks,
      aParsed.totalDuration,
      aTimescale,
      movieTimescale,
      use64Bit
    );
    const dummyMoov = makeBox('moov', Buffer.concat([patchedMvhd, dummyVTrak, dummyATrak]));

    // Assign exact file offsets for every chunk inside mdat
    let currentFileOffset = ftypBuf.length + dummyMoov.length + mdatHeaderSize;
    for (const chunk of interleavedChunks) {
      chunk.fileOffset = currentFileOffset;
      currentFileOffset += chunk.payload.length;
    }

    // Pass 2: Build final moov with exact stco/co64 chunk offsets
    const finalVTrak = rebuildStandardTrak(
      vTrakRaw,
      1,
      true,
      vParsed.samples,
      vParsed.chunks,
      vParsed.totalDuration,
      vTimescale,
      movieTimescale,
      use64Bit
    );
    const finalATrak = rebuildStandardTrak(
      aTrakRaw,
      2,
      false,
      aParsed.samples,
      aParsed.chunks,
      aParsed.totalDuration,
      aTimescale,
      movieTimescale,
      use64Bit
    );
    const finalMoov = makeBox('moov', Buffer.concat([patchedMvhd, finalVTrak, finalATrak]));

    const mdatHeader = Buffer.allocUnsafe(mdatHeaderSize);
    if (mdatHeaderSize === 16) {
      mdatHeader.writeUInt32BE(1, 0);
      mdatHeader.write('mdat', 4, 4, 'ascii');
      mdatHeader.writeBigUInt64BE(BigInt(totalMdatPayloadBytes + 16), 8);
    } else {
      mdatHeader.writeUInt32BE(totalMdatPayloadBytes + 8, 0);
      mdatHeader.write('mdat', 4, 4, 'ascii');
    }

    const tempOut = `${outputPath}.muxing.tmp`;
    const fd = fs.openSync(tempOut, 'w');
    try {
      fs.writeSync(fd, ftypBuf);
      fs.writeSync(fd, finalMoov);
      fs.writeSync(fd, mdatHeader);
      for (const chunk of interleavedChunks) {
        fs.writeSync(fd, chunk.payload);
      }
    } finally {
      fs.closeSync(fd);
    }

    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      fs.renameSync(tempOut, outputPath);
    } catch {
      fs.copyFileSync(tempOut, outputPath);
      try {
        fs.unlinkSync(tempOut);
      } catch {}
    }

    return true;
  } catch (err) {
    console.error('fMP4 to standard MP4 mux failed:', err);
    return false;
  }
}
