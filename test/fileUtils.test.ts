import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { safeDeleteFile, writeFileEnsureDir } from '../src/fileUtils';

describe('fileUtils', () => {
  const testDir = path.join(__dirname, 'test-temp');
  const testFile = path.join(testDir, 'test.txt');
  const nestedFile = path.join(testDir, 'nested', 'deep', 'file.txt');

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('writeFileEnsureDir', () => {
    it('should create file when directory exists', () => {
      fs.mkdirSync(testDir, { recursive: true });
      writeFileEnsureDir(testFile, 'test content');
      
      expect(fs.existsSync(testFile)).to.be.true;
      expect(fs.readFileSync(testFile, 'utf-8')).to.equal('test content');
    });

    it('should create directory and file when directory does not exist', () => {
      writeFileEnsureDir(testFile, 'test content');
      
      expect(fs.existsSync(testDir)).to.be.true;
      expect(fs.existsSync(testFile)).to.be.true;
      expect(fs.readFileSync(testFile, 'utf-8')).to.equal('test content');
    });

    it('should create nested directories', () => {
      writeFileEnsureDir(nestedFile, 'nested content');
      
      expect(fs.existsSync(nestedFile)).to.be.true;
      expect(fs.readFileSync(nestedFile, 'utf-8')).to.equal('nested content');
    });

    it('should overwrite existing file', () => {
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(testFile, 'old content');
      
      writeFileEnsureDir(testFile, 'new content');
      
      expect(fs.readFileSync(testFile, 'utf-8')).to.equal('new content');
    });

    it('should write empty content', () => {
      writeFileEnsureDir(testFile, '');
      
      expect(fs.existsSync(testFile)).to.be.true;
      expect(fs.readFileSync(testFile, 'utf-8')).to.equal('');
    });

    it('should write special characters', () => {
      const specialContent = 'Test with special chars: 你好 🚀 \n\t\r';
      writeFileEnsureDir(testFile, specialContent);
      
      expect(fs.readFileSync(testFile, 'utf-8')).to.equal(specialContent);
    });

    it('should handle very long content', () => {
      const longContent = 'x'.repeat(100000);
      writeFileEnsureDir(testFile, longContent);
      
      expect(fs.readFileSync(testFile, 'utf-8')).to.equal(longContent);
    });

    it('should throw error for invalid path', () => {
      const invalidPath = '\0invalid';
      expect(() => writeFileEnsureDir(invalidPath, 'content')).to.throw();
    });
  });

  describe('safeDeleteFile', () => {
    it('should delete existing file and return true', () => {
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(testFile, 'test');
      
      const result = safeDeleteFile(testFile);
      
      expect(result).to.be.true;
      expect(fs.existsSync(testFile)).to.be.false;
    });

    it('should return false when file does not exist', () => {
      const result = safeDeleteFile(testFile);
      
      expect(result).to.be.false;
    });

    it('should handle nested file deletion', () => {
      fs.mkdirSync(path.join(testDir, 'nested', 'deep'), { recursive: true });
      fs.writeFileSync(nestedFile, 'test');
      
      const result = safeDeleteFile(nestedFile);
      
      expect(result).to.be.true;
      expect(fs.existsSync(nestedFile)).to.be.false;
    });

    it('should call onError callback on failure', () => {
      let errorCalled = false;
      let capturedError: Error | undefined;
      
      const result = safeDeleteFile('/invalid/path/file.txt', (error) => {
        errorCalled = true;
        capturedError = error;
      });
      
      expect(result).to.be.false;
      expect(errorCalled).to.be.true;
      expect(capturedError).to.exist;
    });

    it('should handle multiple rapid deletions', () => {
      fs.mkdirSync(testDir, { recursive: true });
      const files = [
        path.join(testDir, 'file1.txt'),
        path.join(testDir, 'file2.txt'),
        path.join(testDir, 'file3.txt')
      ];
      
      files.forEach(f => fs.writeFileSync(f, 'test'));
      
      const results = files.map(f => safeDeleteFile(f));
      
      results.forEach(result => expect(result).to.be.true);
      files.forEach(f => expect(fs.existsSync(f)).to.be.false);
    });

    it('should handle file with special characters in name', () => {
      fs.mkdirSync(testDir, { recursive: true });
      const specialFile = path.join(testDir, 'file with spaces & special.txt');
      fs.writeFileSync(specialFile, 'test');
      
      const result = safeDeleteFile(specialFile);
      
      expect(result).to.be.true;
      expect(fs.existsSync(specialFile)).to.be.false;
    });
  });

  describe('integration scenarios', () => {
    it('should write and then delete file', () => {
      writeFileEnsureDir(testFile, 'test content');
      expect(fs.existsSync(testFile)).to.be.true;
      
      const result = safeDeleteFile(testFile);
      expect(result).to.be.true;
      expect(fs.existsSync(testFile)).to.be.false;
    });

    it('should handle write, delete, write cycle', () => {
      writeFileEnsureDir(testFile, 'first content');
      safeDeleteFile(testFile);
      writeFileEnsureDir(testFile, 'second content');
      
      expect(fs.existsSync(testFile)).to.be.true;
      expect(fs.readFileSync(testFile, 'utf-8')).to.equal('second content');
    });

    it('should handle multiple files in same directory', () => {
      const file1 = path.join(testDir, 'file1.txt');
      const file2 = path.join(testDir, 'file2.txt');
      
      writeFileEnsureDir(file1, 'content1');
      writeFileEnsureDir(file2, 'content2');
      
      expect(fs.readFileSync(file1, 'utf-8')).to.equal('content1');
      expect(fs.readFileSync(file2, 'utf-8')).to.equal('content2');
      
      safeDeleteFile(file1);
      
      expect(fs.existsSync(file1)).to.be.false;
      expect(fs.existsSync(file2)).to.be.true;
    });
  });
});
