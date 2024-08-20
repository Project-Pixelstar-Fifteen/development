/*
 * Copyright (C) 2024 The Android Open Source Project
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

import {WinscopeEvent, WinscopeEventType} from 'messaging/winscope_event';
import {MediaBasedTraceEntry} from 'trace/media_based_trace_entry';
import {Trace, TraceEntry} from 'trace/trace';
import {Traces} from 'trace/traces';
import {TraceEntryFinder} from 'trace/trace_entry_finder';
import {TRACE_INFO} from 'trace/trace_info';
import {TraceType} from 'trace/trace_type';
import {ViewerMediaBasedComponent} from 'viewers/components/viewer_media_based_component';
import {View, Viewer, ViewType} from 'viewers/viewer';

class ViewerScreenshot implements Viewer {
  static readonly DEPENDENCIES: TraceType[] = [TraceType.SCREENSHOT];

  private readonly traces: Array<Trace<MediaBasedTraceEntry>>;
  private readonly htmlElement: HTMLElement;
  private readonly view: View;

  constructor(traces: Traces) {
    this.traces = traces.getTraces(TraceType.SCREENSHOT);
    this.htmlElement = document.createElement('viewer-media-based');
    this.view = new View(
      ViewType.OVERLAY,
      this.getTraces(),
      this.htmlElement,
      TRACE_INFO[TraceType.SCREENSHOT].name,
    );
  }

  async onWinscopeEvent(event: WinscopeEvent) {
    await event.visit(
      WinscopeEventType.TRACE_POSITION_UPDATE,
      async (event) => {
        const traceEntries = this.traces
          .map((trace) =>
            TraceEntryFinder.findCorrespondingEntry(trace, event.position),
          )
          .filter((entry) => entry !== undefined) as Array<
          TraceEntry<MediaBasedTraceEntry>
        >;
        const entries: MediaBasedTraceEntry[] = await Promise.all(
          traceEntries.map((entry) => {
            return entry.getValue();
          }),
        );
        (
          this.htmlElement as unknown as ViewerMediaBasedComponent
        ).currentTraceEntries = entries;
        (this.htmlElement as unknown as ViewerMediaBasedComponent).titles =
          traceEntries.map((traceEntry) =>
            traceEntry.getFullTrace().getDescriptors().join(', '),
          );
      },
    );
    await event.visit(
      WinscopeEventType.EXPANDED_TIMELINE_TOGGLED,
      async (event) => {
        (
          this.htmlElement as unknown as ViewerMediaBasedComponent
        ).forceMinimize = event.isTimelineExpanded;
      },
    );
  }

  setEmitEvent() {
    // do nothing
  }

  getViews(): View[] {
    return [this.view];
  }

  getTraces(): Array<Trace<MediaBasedTraceEntry>> {
    return this.traces;
  }
}

export {ViewerScreenshot};
