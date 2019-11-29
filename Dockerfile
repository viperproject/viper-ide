FROM codercom/code-server:v2

RUN curl 'https://marketplace.visualstudio.com/_apis/public/gallery/publishers/viper-admin/vsextensions/viper/latest/vspackage'  --compressed   -o /tmp/viper.vsix && \
    /usr/local/bin/code-server --install-extension /tmp/viper.vsix && \
    rm -f /tmp/server.vsix

USER root

RUN apt-get -y update && \
    apt-get -y install unzip openjdk-11-jre && \
    curl -# -o /tmp/viper.zip http://viper.ethz.ch/downloads/ViperToolsLinux-experimental.zip && \
    unzip /tmp/viper.zip -d /usr/local/Viper && \
    rm /tmp/viper.zip

RUN rm -f /etc/sudoers.d/nopasswd && \
    wget -c https://bitbucket.org/viperproject/examples/get/default.zip -O /home/coder/project/default.zip && \
    unzip /home/coder/project/default.zip -d /home/coder/project/ && \
    rm -f /home/coder/project/default.zip && \
    chown -R root:root /home /tmp

USER coder
