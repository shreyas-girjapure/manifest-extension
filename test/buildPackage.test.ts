import { expect } from 'chai';
import { buildPackageFromText } from '../src/extension';

describe('buildPackageFromText', () => {
  it('builds package.xml from simple selection ranges', () => {
    const text = `
<Package>
<types>
  <members>MyClass</members>
  <name>ApexClass</name>
</types>
</Package>
`;
    const ranges = [{ start: text.indexOf('<members>'), end: text.indexOf('</name>') + '</name>'.length }];
    const pkg = buildPackageFromText(text, ranges as any);
    expect(pkg).to.be.a('string');
    expect(pkg).to.include('<name>ApexClass</name>');
    expect(pkg).to.include('<members>MyClass</members>');
  });
});
