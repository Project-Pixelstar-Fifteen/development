/*
 * Copyright (C) 2022 The Android Open Source Project
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

export interface TraceTreeNode {
  children: TraceTreeNode[];
  name: string;
  kind: string;
  stableId: string;
  parent?: TraceTreeNode;
  displays?: TraceTreeNode[];
  windowStates?: TraceTreeNode[];
  client?: any;
  inputMethodService?: any;
  inputMethodManagerService?: any;
  where?: string;
  elapsedRealtimeNanos?: number;
  shortName?: string;
  type?: string;
  id?: string | number;
  layerId?: number;
  displayId?: number;
  stackId?: number;
  isVisible?: boolean;
  isMissing?: boolean;
  hwcCompositionType?: number;
  zOrderRelativeOfId?: number;
  isRootLayer?: boolean;
  diffType?: string;
  skip?: any;
  obj?: any;
  proto?: any;
  equals?: any;
}