// Требуется наличие следующих переменных в Jenkins:
// - NODE_JS_ID - идентификатор установленного Node NODE_JS
// - SSH_CRED_ID - идентификатор SSH ключа
// - WEBAPPS_DEPLOY_PATH - путь на сервере, куда необходимо расположить собранные проекты
// - WEBAPPS_DEPLOY_HOST - IP адрес сервера, на который будут отправлены проекты
// - SSH_USER - имя пользователя на сервере
// - SSH_PORT - порт SSH
pipeline {
    agent any

    tools {
        nodejs "${env.NODE_JS_ID}"
    }

    stages {
        stage('Prepare') {
            steps {
                script {
                    // Установка зависимостей в корне, если есть package.json
                    if (fileExists('package.json')) {
                        echo "Installing root dependencies..."
                        sh 'npm install'
                    }
                }
            }
        }

        stage('Build & Deploy Apps') {
            steps {
                script {
                    // Находим все папки в apps, где есть package.json
                    def apps = sh(script: 'find apps -maxdepth 2 -name package.json', returnStdout: true).split()

                    apps.each { packagePath ->
                        def appDir = packagePath.replace('/package.json', '')
                        def appName = appDir.split('/').last()

                        // Создаем отдельный вложенный этап для каждого приложения
                        stage("App: ${appName}") {
                            dir(appDir) {
                                echo "🚀 Processing ${appName}"

                                // 1. Сборка
                                sh 'npm install'
                                sh 'npm run build'

                                // 2. Деплой (только если есть dist)
                                if (fileExists('dist')) {
                                    sshagent([env.SSH_CRED_ID]) {
                                        def remotePath = "${env.WEBAPPS_DEPLOY_PATH}/${appName}"
                                        def sshCmd = "ssh -p ${env.SSH_PORT} -o StrictHostKeyChecking=no ${env.SSH_USER}@${env.WEBAPPS_DEPLOY_HOST}"
                                        def scpCmd = "scp -P ${env.SSH_PORT} -o StrictHostKeyChecking=no"

                                        sh "${sshCmd} 'mkdir -p ${remotePath}'"
                                        sh "${scpCmd} -r dist/* ${env.SSH_USER}@${env.WEBAPPS_DEPLOY_HOST}:${remotePath}/"
                                    }
                                    echo "✅ ${appName} deployed successfully!"
                                } else {
                                    error "❌ Error: 'dist' folder not found for ${appName}"
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            echo "============================================"
            echo "🎉 All tasks finished!"
        }
        success {
            echo "Build Success!"
        }
        failure {
            echo "Build Failed! Check logs."
        }
    }
}