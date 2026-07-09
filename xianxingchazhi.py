import numpy
import numpy as np
import pandas
import pandas as pd
import matplotlib.pyplot as plt
# import folium
import matplotlib

# 中文乱码解决方法
from scipy.interpolate import interp1d

matplotlib.matplotlib_fname()
font = {
    'family': 'SimHei',
    'weight': 'bold',
    'size': 12
}
matplotlib.rc("font", **font)

# 线性插值
def xianxing(data,x):

    data.sort_values(by='时间戳', inplace=True)

    timestamp = data['时间戳']
    x_coords = data['经度']
    y_coords = data['纬度']
    speed = data['对地航速']
    rot = data['转向率']
    direction = data['对地航向']
    sail_angle = data['船首向']

    lon = []
    lat = []
    Speed = []
    Rot = []
    dir = []
    angle = []

    for i in range(1, len(data)):
        if abs(timestamp[i] - timestamp[i - 1]) > 15:
            gap = int(int(timestamp[i] - timestamp[i - 1]) / 10)
            if gap > 10:
                continue
            interval_long = (x_coords[i] - x_coords[i - 1]) / gap
            interval_lat = (y_coords[i] - y_coords[i - 1]) / gap
            interval_speed = (speed[i] - speed[i - 1]) / gap
            interval_rot = (rot[i] - rot[i - 1]) / gap
            interval_dir = (direction[i] - direction[i - 1]) / gap
            interval_angle = (sail_angle[i] - sail_angle[i - 1]) / gap
            for k in range(1, gap):
                # num += [i - 1 + k, [timestamp[i - 1] + k, \
                #                           interval_long * k + x_coords[i - 1], \
                #                           interval_lat * k + y_coords[i - 1], \
                #                           interval_speed * k + speed[i - 1]]]
                lon.append(interval_long * k + x_coords[i - 1])
                lat.append(interval_lat * k + y_coords[i - 1])
                Speed.append(interval_speed * k + speed[i - 1])
                dir.append(interval_dir * k + direction[i - 1])
                Rot.append(interval_rot * k + rot[i - 1])
                angle.append(interval_angle * k + sail_angle[i - 1])
                data.loc[i] = [numpy.NAN, numpy.NAN, numpy.NAN, interval_long * k + x_coords[i - 1],
                               interval_lat * k + y_coords[i - 1]
                    , numpy.NAN, interval_speed * k + speed[i - 1], interval_rot * k + rot[i - 1]
                    , interval_dir * k + direction[i - 1], interval_angle * k + sail_angle[i - 1], numpy.NAN, numpy.NAN]

    data.to_csv("D:\\AIS\\肥肠插值\\" + str(x),mode='a',index=None,header=None)
    # item = pd.DataFrame({'LONGITUDE':lon,'LATITUDE':lat})
    # data = data.append(item,ignore_index=True)
    #data.to_csv('test.csv', index=None)

    # num = int(len(lon) / (932 - len(x_coords)))
    #
    # lat = lat[::num]
    # lon = lon[::num]
    # Speed = Speed[::num]
    # Rot = Rot[::num]
    # dir = dir[::num]
    # angle = angle[::num]
    # print(num)
    # print(lon)
    # print(lat)
    # print(len(lon))
    #
    # plt.plot(x_coords, y_coords, 'o',lw=1)
    # plt.plot(lon, lat, '-x',lw=1)
    # plt.show()

if __name__ == '__main__':

    # data = pd.read_csv('F:\\分类2\\413505330_250.csv')
    #
    # xianxing(data)
    print("")