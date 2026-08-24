// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import type {
  Fixture,
  MediaAsset,
  ProductContent,
} from '@aethertwin/core-model';
import type {
  ProjectAssetSource,
  ProjectStoreState,
} from '@aethertwin/project-store';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentInspector } from './content-inspector';
import { ProjectBackendError } from '../../backend/project-backend-error';
import { LocaleProvider, useI18n } from '../../i18n/locale-provider';
import type { StudioLocale } from '../../i18n/message-schema';
import { DisplayNameProvider, type StudioDisplayNameResolver } from '../../i18n/display-name-provider';
import { message } from '../../i18n/format-message';

type AssetIssue = ProjectStoreState['assetIssues'][number];

const CONTENT_ID = '00000000-0000-4000-8000-000000000201';
const TARGET_ID = '00000000-0000-4000-8000-000000000202';
const FLOOR_ID = '00000000-0000-4000-8000-000000000203';
const LAYER_ID = '00000000-0000-4000-8000-000000000204';
const IMAGE_MEDIA_ID = '00000000-0000-4000-8000-000000000205';
const VIDEO_MEDIA_ID = '00000000-0000-4000-8000-000000000206';
const IMAGE_ASSET_ID = '00000000-0000-4000-8000-000000000207';
const VIDEO_ASSET_ID = '00000000-0000-4000-8000-000000000208';

const target: Fixture = {
  id: TARGET_ID,
  name: 'North display',
  tags: [],
  floorId: FLOOR_ID,
  layerId: LAYER_ID,
  transform: {
    translation: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
  },
  locked: false,
  type: 'fixture',
  kind: 'display-table',
  size: { width: 1_200, height: 600 },
};

const image: MediaAsset = {
  id: IMAGE_MEDIA_ID,
  name: 'Hero image',
  tags: [],
  assetId: IMAGE_ASSET_ID,
  kind: 'image',
};

const video: MediaAsset = {
  id: VIDEO_MEDIA_ID,
  name: 'Demo video',
  tags: [],
  assetId: VIDEO_ASSET_ID,
  kind: 'video',
};

function content(
  mediaAssetIds: readonly string[] = [IMAGE_MEDIA_ID, VIDEO_MEDIA_ID],
): ProductContent {
  return {
    id: CONTENT_ID,
    name: 'North product',
    tags: ['featured'],
    targetEntityId: TARGET_ID,
    description: 'Original description',
    mediaAssetIds,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderInspector(options: {
  readonly value?: ProductContent;
  readonly media?: readonly MediaAsset[];
  readonly assetIssues?: readonly AssetIssue[];
  readonly onPatch?: (before: ProductContent, after: ProductContent) => Promise<void>;
  readonly onImport?: (
    role: 'content-image' | 'content-video',
    initiator: HTMLElement,
  ) => Promise<void>;
  readonly onRepair?: (media: MediaAsset, initiator: HTMLElement) => Promise<void>;
  readonly resolveAsset?: (
    assetId: string,
  ) => Promise<ProjectAssetSource>;
  readonly locale?: StudioLocale;
  readonly resolver?: StudioDisplayNameResolver;
} = {}) {
  const onPatch = vi.fn(options.onPatch ?? (async () => undefined));
  const onImport = vi.fn(options.onImport ?? (async () => undefined));
  const onRepair = vi.fn(options.onRepair ?? (async () => undefined));
  const resolveAsset = vi.fn(options.resolveAsset ?? (async (
    assetId: string,
  ): Promise<ProjectAssetSource> => ({
    assetId,
    url: assetId === IMAGE_ASSET_ID
      ? 'blob:https://aethertwin.test/hero'
      : 'aethertwin-asset://asset/session/demo',
    mediaType: assetId === IMAGE_ASSET_ID ? 'image/png' : 'video/mp4',
  })));
  let setLocale: ((locale: StudioLocale) => void) | undefined;
  function LocaleProbe() {
    setLocale = useI18n().setLocale;
    return null;
  }
  const result = render(
    <LocaleProvider initialLocale={options.locale ?? 'zh-CN'} preference={{ read: () => 'zh-CN', write: () => undefined }}>
      <LocaleProbe />
      <DisplayNameProvider resolver={options.resolver}>
      <ContentInspector
      content={options.value ?? content()}
      target={target}
      media={options.media ?? [image, video]}
      assetIssues={options.assetIssues ?? []}
      onPatch={onPatch}
      onImport={onImport}
      onRepair={onRepair}
      resolveAsset={resolveAsset}
      />
      </DisplayNameProvider>
    </LocaleProvider>,
  );
  return {
    ...result, onPatch, onImport, onRepair, resolveAsset,
    setLocale: (locale: StudioLocale) => setLocale?.(locale),
  };
}

afterEach(() => cleanup());

describe('M2.3 Task 11 ContentInspector', () => {
  it('uses a canonical media resolver only for presentation without changing raw media or patch payloads', async () => {
    const before = content([]);
    const { onPatch } = renderInspector({
      value: before,
      media: [image],
      resolver: (subject) => subject.kind === 'media-asset'
        ? message('webDemo.displayName', { zh: '规范图片', en: 'Canonical image' })
        : null,
    });
    const user = userEvent.setup();
    expect(screen.getByText('规范图片')).toBeVisible();
    expect(image.name).toBe('Hero image');
    await user.click(screen.getByRole('button', { name: '移除 Hero image' }));
    expect(onPatch).toHaveBeenCalledWith(before, { ...before, mediaAssetIds: [] });
  });
  it('redacts failed imports before and after a live locale switch', async () => {
    const secret = 'C:\\secret\\media.png';
    const { setLocale } = renderInspector({
      onImport: async () => {
        throw new ProjectBackendError('ASSET_IO_FAILED', secret, { secret }, 'unsafe ref / path');
      },
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '导入图片' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('资源操作未能完成');
    expect(document.body.textContent).not.toContain(secret);
    act(() => setLocale('en'));
    expect(screen.getByRole('alert')).toHaveTextContent('asset operation could not be completed');
    expect(document.body.textContent).not.toContain('unsafe ref / path');
  });
  it('reformats media controls in place without changing authored media or import payloads', async () => {
    const pending = deferred<void>();
    const { onImport, setLocale } = renderInspector({ onImport: async () => pending.promise });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '导入图片' }));
    expect(screen.getByRole('button', { name: '导入图片' })).toBeDisabled();
    act(() => setLocale('en'));

    expect(screen.getByRole('heading', { name: 'Product content' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Import image' })).toBeDisabled();
    expect(screen.getByText('Hero image')).toBeVisible();
    expect(onImport).toHaveBeenCalledWith('content-image', expect.any(HTMLElement));
    pending.resolve();
  });
  it('patches normalized name, description, and unique ordered tags once', async () => {
    const before = content([]);
    const { onPatch } = renderInspector({ value: before, media: [] });
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText('内容名称'));
    await user.type(screen.getByLabelText('内容名称'), '  Updated product  ');
    await user.clear(screen.getByLabelText('内容描述'));
    await user.type(screen.getByLabelText('内容描述'), 'Updated description');
    await user.clear(screen.getByLabelText('内容标签'));
    await user.type(screen.getByLabelText('内容标签'), 'featured, north, featured');
    await user.click(screen.getByRole('button', { name: '应用内容' }));

    expect(onPatch).toHaveBeenCalledOnce();
    expect(onPatch).toHaveBeenCalledWith(before, {
      ...before,
      name: 'Updated product',
      description: 'Updated description',
      tags: ['featured', 'north'],
    });
  });

  it('renders durable media order and patches move or remove without deleting records', async () => {
    const before = content();
    const { onPatch } = renderInspector({ value: before });
    const user = userEvent.setup();
    const list = screen.getByRole('list', { name: '产品媒体' });
    const rows = within(list).getAllByRole('listitem');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Hero image');
    expect(rows[1]).toHaveTextContent('Demo video');
    expect(screen.getByRole('button', { name: '上移 Hero image' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下移 Demo video' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '下移 Hero image' }));
    expect(onPatch).toHaveBeenLastCalledWith(before, {
      ...before,
      mediaAssetIds: [VIDEO_MEDIA_ID, IMAGE_MEDIA_ID],
    });

    await user.click(screen.getByRole('button', { name: '移除 Demo video' }));
    expect(onPatch).toHaveBeenLastCalledWith(before, {
      ...before,
      mediaAssetIds: [IMAGE_MEDIA_ID],
    });
    expect(onPatch).toHaveBeenCalledTimes(2);
  });

  it('operates media controls from the keyboard', async () => {
    const before = content();
    const { onPatch } = renderInspector({ value: before });
    const user = userEvent.setup();
    const move = screen.getByRole('button', { name: '上移 Demo video' });

    move.focus();
    await user.keyboard('{Enter}');

    expect(onPatch).toHaveBeenCalledWith(before, {
      ...before,
      mediaAssetIds: [VIDEO_MEDIA_ID, IMAGE_MEDIA_ID],
    });
  });

  it('resolves only project asset URLs for image and video previews', async () => {
    const { resolveAsset } = renderInspector();

    const imagePreview = await screen.findByRole('img', { name: 'Hero image 预览' });
    const videoPreview = await screen.findByLabelText('Demo video 预览');
    expect(imagePreview).toHaveAttribute('src', 'blob:https://aethertwin.test/hero');
    expect(videoPreview).toHaveAttribute(
      'src',
      'aethertwin-asset://asset/session/demo',
    );
    expect(videoPreview).toHaveAttribute('controls');
    expect(resolveAsset.mock.calls.map(([assetId]) => assetId)).toEqual([
      IMAGE_ASSET_ID,
      VIDEO_ASSET_ID,
    ]);
    expect(document.body.innerHTML).not.toContain('file://');
    expect(document.body.innerHTML).not.toContain('http://');
    expect(document.body.innerHTML).not.toContain('https://cdn');
  });

  it('fails closed for codec preview errors and repairs only missing or corrupt media', async () => {
    const issues: readonly AssetIssue[] = [
      { assetId: IMAGE_ASSET_ID, code: 'ASSET_CORRUPT' },
      { assetId: VIDEO_ASSET_ID, code: 'ASSET_CODEC_PREVIEW_UNAVAILABLE' },
    ];
    const repair = deferred<void>();
    const { onRepair, resolveAsset } = renderInspector({
      assetIssues: issues,
      onRepair: async () => repair.promise,
    });
    const user = userEvent.setup();

    expect(screen.getByText('资源预览不可用')).toBeVisible();
    expect(screen.getByText('当前平台无法预览此视频编码')).toBeVisible();
    expect(screen.queryByLabelText('Demo video 预览')).not.toBeInTheDocument();
    expect(resolveAsset).not.toHaveBeenCalled();

    const repairButton = screen.getByRole('button', { name: '修复 Hero image' });
    await user.click(repairButton);
    expect(onRepair).toHaveBeenCalledOnce();
    expect(onRepair).toHaveBeenCalledWith(image, repairButton);
    expect(repairButton).toBeDisabled();
    expect(screen.queryByRole('button', { name: '修复 Demo video' })).not.toBeInTheDocument();

    repair.resolve();
    await waitFor(() => expect(repairButton).toBeEnabled());
  });

  it('forwards exact image/video roles and suppresses duplicate picker ownership', async () => {
    const pending = deferred<void>();
    const { onImport } = renderInspector({
      onImport: async () => pending.promise,
    });
    const user = userEvent.setup();
    const imageButton = screen.getByRole('button', { name: '导入图片' });
    const videoButton = screen.getByRole('button', { name: '导入视频' });

    await user.click(imageButton);
    await user.click(videoButton);
    expect(onImport).toHaveBeenCalledOnce();
    expect(onImport).toHaveBeenCalledWith('content-image', imageButton);
    expect(imageButton).toBeDisabled();
    expect(videoButton).toBeDisabled();

    pending.resolve();
    await waitFor(() => expect(imageButton).toBeEnabled());
    expect(videoButton).toBeEnabled();
  });
});
