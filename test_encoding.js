const fs = require('fs');
const path = require('path');
const { EncodingUtils } = require('./out/utils/encodingUtils');

// 测试编码检测和读取
function testEncoding() {
    // 测试文件路径
    const testFiles = [
        // 这里可以添加测试文件路径
        // 'path/to/test/file.txt'
    ];

    testFiles.forEach(filePath => {
        console.log(`\nTesting file: ${filePath}`);
        
        try {
            // 检测编码
            const detectedEncoding = EncodingUtils.detectEncoding(filePath);
            console.log(`Detected encoding: ${detectedEncoding}`);
            
            // 尝试读取文件
            const fileSize = fs.statSync(filePath).size;
            const content = EncodingUtils.readFileWithEncoding(filePath, 0, Math.min(fileSize, 1024), detectedEncoding);
            console.log(`First 200 chars: ${content.substring(0, 200)}...`);
            
            // 尝试其他编码
            const encodings = ['utf8', 'gbk', 'gb2312', 'gb18030'];
            encodings.forEach(enc => {
                if (enc !== detectedEncoding) {
                    try {
                        const altContent = EncodingUtils.readFileWithEncoding(filePath, 0, Math.min(fileSize, 1024), enc);
                        console.log(`With ${enc}: ${altContent.substring(0, 200)}...`);
                    } catch (e) {
                        console.log(`Failed with ${enc}: ${e.message}`);
                    }
                }
            });
        } catch (error) {
            console.error(`Error testing ${filePath}: ${error.message}`);
        }
    });
}

// 运行测试
testEncoding();
