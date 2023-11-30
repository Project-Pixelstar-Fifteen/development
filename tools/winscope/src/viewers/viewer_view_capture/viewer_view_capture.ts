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

import {AppEvent, TabbedViewSwitchRequest} from 'app/app_event';
import {FunctionUtils} from 'common/function_utils';
import {EmitAppEvent} from 'interfaces/app_event_emitter';
import {Traces} from 'trace/traces';
import {TraceType} from 'trace/trace_type';
import {ViewerEvents} from 'viewers/common/viewer_events';
import {View, Viewer, ViewType} from 'viewers/viewer';
import {Presenter} from './presenter';
import {UiData} from './ui_data';

export class ViewerViewCapture implements Viewer {
  static readonly DEPENDENCIES: TraceType[] = [TraceType.VIEW_CAPTURE];
  private emitAppEvent: EmitAppEvent = FunctionUtils.DO_NOTHING_ASYNC;
  private htmlElement: HTMLElement;
  private presenter: Presenter;

  constructor(traces: Traces, storage: Storage) {
    this.htmlElement = document.createElement('viewer-view-capture');
    this.presenter = new Presenter(this.getDependencies()[0], traces, storage, (data: UiData) => {
      (this.htmlElement as any).inputData = data;
    });

    this.htmlElement.addEventListener(ViewerEvents.HierarchyPinnedChange, (event) =>
      this.presenter.updatePinnedItems((event as CustomEvent).detail.pinnedItem)
    );
    this.htmlElement.addEventListener(ViewerEvents.HighlightedChange, (event) =>
      this.presenter.updateHighlightedItem(`${(event as CustomEvent).detail.id}`)
    );
    this.htmlElement.addEventListener(ViewerEvents.HierarchyUserOptionsChange, (event) =>
      this.presenter.updateHierarchyTree((event as CustomEvent).detail.userOptions)
    );
    this.htmlElement.addEventListener(ViewerEvents.HierarchyFilterChange, (event) =>
      this.presenter.filterHierarchyTree((event as CustomEvent).detail.filterString)
    );
    this.htmlElement.addEventListener(ViewerEvents.PropertiesUserOptionsChange, (event) =>
      this.presenter.updatePropertiesTree((event as CustomEvent).detail.userOptions)
    );
    this.htmlElement.addEventListener(ViewerEvents.PropertiesFilterChange, (event) =>
      this.presenter.filterPropertiesTree((event as CustomEvent).detail.filterString)
    );
    this.htmlElement.addEventListener(ViewerEvents.SelectedTreeChange, (event) =>
      this.presenter.newPropertiesTree((event as CustomEvent).detail.selectedItem)
    );
    this.htmlElement.addEventListener(ViewerEvents.MiniRectsDblClick, (event) => {
      this.switchToSurfaceFlingerView();
    });
  }

  async onAppEvent(event: AppEvent) {
    await this.presenter.onAppEvent(event);
  }

  setEmitAppEvent(callback: EmitAppEvent) {
    this.emitAppEvent = callback;
  }

  async switchToSurfaceFlingerView() {
    await this.emitAppEvent(new TabbedViewSwitchRequest(TraceType.SURFACE_FLINGER));
  }

  getViews(): View[] {
    return [
      new View(
        ViewType.TAB,
        this.getDependencies(),
        this.htmlElement,
        this.getTitle(),
        this.getDependencies()[0]
      ),
    ];
  }

  getDependencies(): TraceType[] {
    return ViewerViewCapture.DEPENDENCIES;
  }

  private getTitle(): string {
    switch (this.getDependencies()[0]) {
      case TraceType.VIEW_CAPTURE_TASKBAR_DRAG_LAYER:
        return 'View Capture - Taskbar';
      case TraceType.VIEW_CAPTURE_TASKBAR_OVERLAY_DRAG_LAYER:
        return 'View Capture - Taskbar Overlay';
      default:
        return 'View Capture - Nexuslauncher';
    }
  }
}

export class ViewerViewCaptureLauncherActivity extends ViewerViewCapture {
  static override readonly DEPENDENCIES: TraceType[] = [TraceType.VIEW_CAPTURE_LAUNCHER_ACTIVITY];
  override getDependencies(): TraceType[] {
    return ViewerViewCaptureLauncherActivity.DEPENDENCIES;
  }
}

export class ViewerViewCaptureTaskbarDragLayer extends ViewerViewCapture {
  static override readonly DEPENDENCIES: TraceType[] = [TraceType.VIEW_CAPTURE_TASKBAR_DRAG_LAYER];
  override getDependencies(): TraceType[] {
    return ViewerViewCaptureTaskbarDragLayer.DEPENDENCIES;
  }
}

export class ViewerViewCaptureTaskbarOverlayDragLayer extends ViewerViewCapture {
  static override readonly DEPENDENCIES: TraceType[] = [
    TraceType.VIEW_CAPTURE_TASKBAR_OVERLAY_DRAG_LAYER,
  ];
  override getDependencies(): TraceType[] {
    return ViewerViewCaptureTaskbarOverlayDragLayer.DEPENDENCIES;
  }
}