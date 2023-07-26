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

import {RealTimestamp} from 'trace/timestamp';
import {Transformer} from './transformer';

describe('Transformer', () => {
  it('can transform', () => {
    const fromRange = {
      from: new RealTimestamp(1689763211000000000n),
      to: new RealTimestamp(1689763571000000000n),
    };
    const toRange = {
      from: 100,
      to: 1100,
    };
    const transformer = new Transformer(fromRange, toRange);

    const rangeStart = fromRange.from.getValueNs();
    const rangeEnd = fromRange.to.getValueNs();
    const range = fromRange.to.getValueNs() - fromRange.from.getValueNs();

    expect(transformer.transform(fromRange.from)).toBe(toRange.from);
    expect(transformer.transform(fromRange.to)).toBe(toRange.to);

    expect(transformer.transform(new RealTimestamp(rangeStart + range / 2n))).toBe(
      toRange.from + (toRange.to - toRange.from) / 2
    );
    expect(transformer.transform(new RealTimestamp(rangeStart + range / 4n))).toBe(
      toRange.from + (toRange.to - toRange.from) / 4
    );
    expect(transformer.transform(new RealTimestamp(rangeStart + range / 20n))).toBe(
      toRange.from + (toRange.to - toRange.from) / 20
    );

    expect(transformer.transform(new RealTimestamp(rangeStart - range / 2n))).toBe(
      toRange.from - (toRange.to - toRange.from) / 2
    );
    expect(transformer.transform(new RealTimestamp(rangeEnd + range / 2n))).toBe(
      toRange.to + (toRange.to - toRange.from) / 2
    );
  });

  it('can untransform', () => {
    const fromRange = {
      from: new RealTimestamp(1689763211000000000n),
      to: new RealTimestamp(1689763571000000000n),
    };
    const toRange = {
      from: 100,
      to: 1100,
    };
    const transformer = new Transformer(fromRange, toRange);

    const rangeStart = fromRange.from.getValueNs();
    const rangeEnd = fromRange.to.getValueNs();
    const range = fromRange.to.getValueNs() - fromRange.from.getValueNs();

    expect(transformer.untransform(toRange.from).getValueNs()).toBe(fromRange.from.getValueNs());
    expect(transformer.untransform(toRange.to).getValueNs()).toBe(fromRange.to.getValueNs());

    expect(
      transformer.untransform(toRange.from + (toRange.to - toRange.from) / 2).getValueNs()
    ).toBe(rangeStart + range / 2n);
    expect(
      transformer.untransform(toRange.from + (toRange.to - toRange.from) / 4).getValueNs()
    ).toBe(rangeStart + range / 4n);
    expect(
      transformer.untransform(toRange.from + (toRange.to - toRange.from) / 20).getValueNs()
    ).toBe(rangeStart + range / 20n);

    expect(
      transformer.untransform(toRange.from - (toRange.to - toRange.from) / 2).getValueNs()
    ).toBe(rangeStart - range / 2n);
    expect(
      transformer.untransform(toRange.from + (toRange.to - toRange.from) / 2).getValueNs()
    ).toBe(rangeStart + range / 2n);
  });
});
