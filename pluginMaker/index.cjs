/*
 * @Description:
 * @Version: 1.668
 * @Autor: 地虎降天龙
 * @Date: 2024-01-08 09:01:48
 * @LastEditors: 地虎降天龙
 * @LastEditTime: 2025-10-10 14:32:37
 */
const compressing = require('compressing')
const fs = require('fs')
var path = require('path')
const readline = require('readline')

// 示例代码
const args = process.argv // 包含了所有的命令行参数，第一个元素为 node 路径，第二个元素为脚本文件名

if (!args[2]) {
    console.error('【类型:creat、package、install】 参数错误',args)
    return
    // process.exit(1)
}

function fileExistsWithCaseSync(filepath) {
    var dir = path.dirname(filepath)
    if (dir === path.dirname(dir)) {
        return true
    }
    var filenames = fs.readdirSync(dir)
    if (filenames.indexOf(path.basename(filepath)) === -1) {
        return false
    }
    return fileExistsWithCaseSync(dir)
}
const packagePlugins = (pluginName) => {
    if (!pluginName) {
        console.error('打包插件_:【插件名错误】 ')
        return
    }
    const pluginPath = './src/plugins/' + pluginName
    // 检查是否存在此插件
    if (!fileExistsWithCaseSync(pluginPath)) {
        console.error(`打包插件_:不存在名为:【 ${pluginName} 】的插件。地址：${pluginPath}`)
        return
    }
    const packagePath = `./pluginMaker/packages/${pluginName}.zip`
    // compressing.zip.compressDir(pluginPath, packagePath, { ignoreBase: false })
    // 	.then(() => {
    // 		console.log(`打包插件_:【 ${pluginName} 】 成功。 地址：${packagePath}`)
    // 	})
    // 	.catch(err => {
    // 		console.error(err)
    // 	})
    const zipStream = new compressing.zip.Stream()
    zipStream.addEntry(pluginPath, { relativePath: pluginPath, ignoreBase: true })
    // zipStream.addEntry(`./public/plugins/${pluginName}`, { relativePath: `./public/plugins/${pluginName}`, ignoreBase: true })
    // ✅ 仅当 public/plugins 存在时才添加
    const publicPluginPath = `./public/plugins/${pluginName}`
    if (fs.existsSync(publicPluginPath)) {
        zipStream.addEntry(publicPluginPath, {
            relativePath: publicPluginPath,
            ignoreBase: true
        })
    } else {
        console.warn(`⚠️  打包插件_: 未找到 public 目录：${publicPluginPath}，已跳过。`)
    }
    const destStream = fs.createWriteStream(packagePath)
    zipStream
        .pipe(destStream)
        .on('finish', () => {
            console.log(`打包插件_:【 ${pluginName} 】 成功。地址：${packagePath}`)
        })
        .on('error', (err) => {
            console.error(err)
        })
}
const installPlugins = (pluginName) => {
    if (!pluginName) {
        console.error('安装插件_:【插件名错误】 ')
        return
    }
    // 检查是否存在此插件包
    const packagePath = `./pluginMaker/install/${pluginName}.zip`
    if (!fileExistsWithCaseSync(packagePath)) {
        console.error(`安装插件_:不存在名为:【 ${pluginName} 】的插件包。地址：${packagePath}`)
        return
    }
    const pluginPath = './src/plugins/' + pluginName
    // 检查是否存在此插件目录
    if (fileExistsWithCaseSync(pluginPath)) {
        console.error(`安装插件_:已经存在名为:【 ${pluginName} 】的插件。目录地址为：${pluginPath}。 如若需要安装请备份和删除该插件`)
        return
    }
    // 解压插件 到 目录
    compressing.zip
        .uncompress(packagePath, './')
        .then(() => {
            console.log(`安装插件_:【 ${pluginName} 】 成功。地址：${pluginPath}。安装文件包请自行删除。`)
            const configFile = path.join(pluginPath, 'config.js')
            if (fs.existsSync(configFile) && /["']?tvtstore["']?\s*:\s*["']LOCAL["']/.test(fs.readFileSync(configFile, 'utf8'))) {
                console.log('请在预览页 → 我的插件中查看。')
            }
        })
        .catch((err) => {
            console.error(err)
        })
}

const createPlugins = (pluginName) => {
    if (!pluginName) {
        console.error('新建插件_:【插件名错误】 ')
        return
    }
    const pluginPath = './src/plugins/' + pluginName
    // 检查是否存在此插件目录
    if (fileExistsWithCaseSync(pluginPath)) {
        console.error(`新建插件_:已经存在名为:【 ${pluginName} 】的插件。目录地址为：${pluginPath}。 请取其他的名字`)
        return
    }

    // 创建目录
    const publicPath = `./public/plugins/${pluginName}/preview`
    fs.mkdir(publicPath, { recursive: true }, (err) => {
        if (err) throw err
        console.log(`新建插件_:静态资源目录已创建:【 ${publicPath} 】`)
    })

    // 解压对应的模版代码到对应的目录
    compressing.zip
        .uncompress('./pluginMaker/template.zip', pluginPath)
        .then(() => {
            // 要替换的字符及其替换后的内容
            const configFile = pluginPath + '/config.js'

            // 获得当前日期
            const currentDate = new Date()
            const year = currentDate.getFullYear() // 获取年份
            const month = String(currentDate.getMonth() + 1).padStart(2, '0') // 获取月份（注意月份是从 0 开始的，需要加 1）
            const day = String(currentDate.getDate()).padStart(2, '0') // 获取日期
            const formattedDate = `${year}-${month}-${day}`

            const replaceCharacters = {
                template: pluginName,
                '2024-01-01': formattedDate,
            }
            // 读取原始文件内容
            fs.readFile(configFile, 'utf8', (err, data) => {
                if (err) throw err
                // 遍历需要替换的字符列表
                for (let oldChar in replaceCharacters) {
                    const newChar = replaceCharacters[oldChar]
                    // 在数据中查找并替换指定字符
                    data = data.replace(new RegExp(oldChar, 'g'), newChar)
                }
                // 将修改后的内容写入新文件
                fs.writeFile(configFile, data, 'utf8', (err) => {
                    if (err) throw err
                    console.log(`新建插件_:【 ${configFile} 】config修改完毕`)
                    console.log(`新建插件_:【 ${pluginName} 】 成功。地址：${pluginPath}。请自行更改config.js`)
                    console.log('请在预览页 → 我的插件中查看。')
                })
            })
        })
        .catch((err) => {
            console.error(err)
        })
}

const removePlugins = (pluginName) => {
    if (!pluginName) {
        console.error('删除插件_:【插件名错误】 ')
        return
    }

    const pluginPath = './src/plugins/' + pluginName
    const publicPath = './public/plugins/' + pluginName

    if (!fileExistsWithCaseSync(pluginPath) && !fileExistsWithCaseSync(publicPath)) {
        console.error(`删除插件_:未找到名为:【 ${pluginName} 】的插件目录`)
        return
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    rl.question(`⚠️ 删除插件_:您确认要删除插件 【${pluginName}】 吗？（代码请确保已妥善保存）输入 yes 确认：`, (answer) => {
        if (answer.trim().toLowerCase() === 'yes') {
            if (fs.existsSync(pluginPath)) {
                fs.rmSync(pluginPath, { recursive: true, force: true })
                console.log(`✅ 插件代码目录已删除: ${pluginPath}`)
            }
            if (fs.existsSync(publicPath)) {
                fs.rmSync(publicPath, { recursive: true, force: true })
                console.log(`✅ 插件资源目录已删除: ${publicPath}`)
            }
        } else {
            console.log('取消删除操作')
        }
        rl.close()
    })
}

let type = args[2]
if (type === 'create') {
    createPlugins(args[3])
} else if (type === 'package') {
    packagePlugins(args[3])
} else if (type === 'install') {
    installPlugins(args[3])
} else if (type === 'remove') {
    removePlugins(args[3])
}
