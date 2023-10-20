/*
 * Copyright (C) 2023 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Layer, LayerTraceEntry} from 'flickerlib/common';
import {ParserViewCapture} from 'parsers/parser_view_capture';
import {Rectangle, TransformMatrix} from 'viewers/components/rects/types2d';
import {UserOptions} from './user_options';

export class SurfaceFlingerUtils {
  static makeRects(entry: LayerTraceEntry, hierarchyUserOptions: UserOptions): Rectangle[] {
    const layerRects = SurfaceFlingerUtils.makeLayerRects(entry, hierarchyUserOptions);
    const displayRects = SurfaceFlingerUtils.makeDisplayRects(entry);
    return layerRects.concat(displayRects);
  }

  private static makeLayerRects(
    entry: LayerTraceEntry,
    hierarchyUserOptions: UserOptions
  ): Rectangle[] {
    return entry.flattenedLayers
      .filter((layer: Layer) => {
        return SurfaceFlingerUtils.isLayerToRenderInRectsComponent(layer, hierarchyUserOptions);
      })
      .sort(SurfaceFlingerUtils.compareLayerZ)
      .map((it: Layer) => {
        const transform: TransformMatrix = it.rect.transform?.matrix ?? it.rect.transform;
        const rect: Rectangle = {
          topLeft: {x: it.rect.left, y: it.rect.top},
          bottomRight: {x: it.rect.right, y: it.rect.bottom},
          label: it.rect.label,
          transform,
          isVisible: it.isVisible,
          isDisplay: false,
          id: it.stableId,
          displayId: it.stackId,
          isVirtual: false,
          isClickable: true,
          cornerRadius: it.cornerRadius,
          // TODO(b/291213403): should read this data from the trace instead of a global variable
          hasContent: ParserViewCapture.packageNames.includes(
            it.rect.label.substring(0, it.rect.label.indexOf('/'))
          ),
        };
        return rect;
      });
  }

  private static makeDisplayRects(entry: LayerTraceEntry): Rectangle[] {
    if (!entry.displays) {
      return [];
    }

    return entry.displays?.map((display: any) => {
      const transform: TransformMatrix = display.transform?.matrix ?? display.transform;
      const rect: Rectangle = {
        topLeft: {x: 0, y: 0},
        bottomRight: {x: display.size.width, y: display.size.height},
        label: 'Display',
        transform,
        isVisible: false,
        isDisplay: true,
        id: `Display - ${display.id}`,
        displayId: display.layerStackId,
        isVirtual: display.isVirtual ?? false,
        isClickable: false,
        cornerRadius: 0,
        hasContent: false,
      };
      return rect;
    });
  }

  private static isLayerToRenderInRectsComponent(
    layer: Layer,
    hierarchyUserOptions: UserOptions
  ): boolean {
    const onlyVisible = hierarchyUserOptions['onlyVisible']?.enabled ?? false;
    // Show only visible layers or Visible + Occluded layers. Don't show all layers
    // (flattenedLayers) because container layers are never meant to be displayed
    return layer.isVisible || (!onlyVisible && layer.occludedBy.length > 0);
  }

  static compareLayerZ(a: Layer, b: Layer): number {
    const zipLength = Math.min(a.zOrderPath.length, b.zOrderPath.length);
    for (let i = 0; i < zipLength; ++i) {
      const zOrderA = a.zOrderPath[i];
      const zOrderB = b.zOrderPath[i];
      if (zOrderA > zOrderB) return -1;
      if (zOrderA < zOrderB) return 1;
    }
    // When z-order is the same, the layer with larger ID is on top
    return a.id > b.id ? -1 : 1;
  }
}